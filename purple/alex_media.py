"""Voice (ElevenLabs) and image input helpers for the Teaching Room.

- Speech-to-text: ElevenLabs Scribe v2 (`POST /v1/speech-to-text`, model `scribe_v2`).
- Text-to-speech: ElevenLabs TTS (`POST /v1/text-to-speech/{voice_id}`), cached on disk
  by response ID so reruns and replays never call the API twice.
- Images go to Claude's vision input through `TeachingInput`.

Credentials come from `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` (environment, or
`apps/web/.env.local`). Every failure raises `VoiceUnavailable`; callers fall back to text.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

from .alex_schemas import TeachingInput

IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_AUDIO_BYTES = 25 * 1024 * 1024
ELEVENLABS_URL = "https://api.elevenlabs.io/v1"
STT_MODEL = "scribe_v2"
DEFAULT_TTS_MODEL = "eleven_flash_v2_5"  # ElevenLabs' low-latency model
ROOT = Path(__file__).resolve().parents[1]
TTS_CACHE_DIR = ROOT / ".cache" / "alex_tts"


class VoiceUnavailable(RuntimeError):
    """ElevenLabs is not configured or failed; use text instead."""


# Backwards-compatible name used by earlier callers.
TranscriptionUnavailable = VoiceUnavailable


def env_value(name: str) -> str | None:
    """Environment variable, else the same name in apps/web/.env.local."""
    value = os.getenv(name, "").strip()
    if value:
        return value
    if os.getenv("ALEX_IGNORE_ENV_FILE") == "1":
        return None
    try:
        for line in (ROOT / "apps" / "web" / ".env.local").read_text().splitlines():
            key, _, raw = line.partition("=")
            if key.strip() == name and raw.strip():
                return raw.strip().strip('"').strip("'")
    except OSError:
        return None
    return None


def transcription_available() -> bool:
    return bool(env_value("ELEVENLABS_API_KEY"))


def speech_available() -> bool:
    return bool(env_value("ELEVENLABS_API_KEY") and env_value("ELEVENLABS_VOICE_ID"))


def _post(path: str, **kwargs):
    import requests

    api_key = env_value("ELEVENLABS_API_KEY")
    if not api_key:
        raise VoiceUnavailable("ELEVENLABS_API_KEY is not set.")
    headers = {"xi-api-key": api_key, **kwargs.pop("headers", {})}
    try:
        response = requests.post(f"{ELEVENLABS_URL}{path}", headers=headers, timeout=30, **kwargs)
    except requests.RequestException as exc:
        raise VoiceUnavailable(f"ElevenLabs unreachable: {type(exc).__name__}") from exc
    if response.status_code != 200:
        raise VoiceUnavailable(f"ElevenLabs returned HTTP {response.status_code}.")
    return response


def transcribe_audio(audio: bytes, filename: str = "speech.wav", mime: str = "audio/wav") -> str:
    """Scribe v2 transcript for the student to review and edit before submitting."""
    if not audio:
        raise VoiceUnavailable("The recording is empty.")
    if len(audio) > MAX_AUDIO_BYTES:
        raise VoiceUnavailable("The recording is too long.")
    response = _post(
        "/speech-to-text",
        files={"file": (filename, audio, mime)},
        data={"model_id": STT_MODEL},
    )
    text = str(response.json().get("text", "")).strip()
    if not text:
        raise VoiceUnavailable("No speech was recognised.")
    return text


def tts_cache_path(response_id: str, voice_id: str) -> Path:
    digest = hashlib.sha256(f"{response_id}|{voice_id}".encode()).hexdigest()[:24]
    return TTS_CACHE_DIR / f"{digest}.mp3"


def synthesize_speech(text: str, response_id: str) -> bytes:
    """MP3 of Alex saying `text`; cached per (response ID, voice)."""
    voice_id = env_value("ELEVENLABS_VOICE_ID")
    if not voice_id:
        raise VoiceUnavailable("ELEVENLABS_VOICE_ID is not set.")
    if not text.strip():
        raise VoiceUnavailable("Nothing to say.")
    cached = tts_cache_path(response_id, voice_id)
    if cached.exists():
        return cached.read_bytes()
    response = _post(
        f"/text-to-speech/{voice_id}?output_format=mp3_44100_128",
        headers={"Content-Type": "application/json"},
        json={"text": text[:1000], "model_id": env_value("ELEVENLABS_TTS_MODEL") or DEFAULT_TTS_MODEL},
    )
    audio = response.content
    if not audio:
        raise VoiceUnavailable("ElevenLabs returned no audio.")
    try:
        cached.parent.mkdir(parents=True, exist_ok=True)
        cached.write_bytes(audio)
    except OSError:
        pass  # caching is an optimisation only
    return audio


def image_input(data: bytes, media_type: str, text: str = "") -> TeachingInput:
    """Validate an uploaded image/drawing and wrap it with optional explanation text."""
    media_type = "image/jpeg" if media_type == "image/jpg" else media_type
    if media_type not in IMAGE_TYPES:
        raise ValueError(f"Unsupported image type {media_type}; use PNG, JPEG, GIF or WebP.")
    if not data:
        raise ValueError("The image is empty.")
    if len(data) > MAX_IMAGE_BYTES:
        raise ValueError("Image is larger than 5 MB; please upload a smaller one.")
    return TeachingInput(text=text, modality="image", image_bytes=data, image_media_type=media_type)
