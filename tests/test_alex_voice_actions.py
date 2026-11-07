"""Voice (ElevenLabs), image, toolbar actions, reactions and the web bridge. All offline."""

import base64
import json
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from purple import alex_media, web_bridge
from purple.alex_agent import ClaudeEvaluator, process_teaching_turn, reaction_for, run_alex_action
from purple.alex_media import VoiceUnavailable, image_input, synthesize_speech, transcribe_audio
from purple.alex_schemas import AlexLine, TeachingInput
from purple.contracts import Chapter

ROOT = Path(__file__).resolve().parents[1]
FULL = ("Repeated board flex concentrates mechanical stress at solder joints, and microcracks "
        "create intermittent electrical continuity during movement.")
WEB_CHAPTER = {
    "week": 1, "title": "Proportional control", "summary": "Gain trades speed for overshoot.",
    "era": {"name": "Steam", "years": "1880s", "problem": "Governors overshoot."},
    "ilos": [{"id": "W1.1", "statement": "Explain the speed-versus-overshoot trade-off",
              "bloomLevel": "apply", "keyConcepts": ["Proportional gain", "Overshoot trade-off"]}],
    "sourceRefs": [],
}


@pytest.fixture(autouse=True)
def isolated(monkeypatch, tmp_path):
    monkeypatch.setenv("ALEX_OFFLINE", "1")
    monkeypatch.setenv("ALEX_IGNORE_ENV_FILE", "1")
    for name in ("ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "ELEVENLABS_TTS_MODEL"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(alex_media, "TTS_CACHE_DIR", tmp_path / "tts")


@pytest.fixture
def pcb():
    return Chapter.model_validate(json.loads((ROOT / "examples" / "pcb_chapter.json").read_text()))


class FakeHTTP:
    def __init__(self, status=200, payload=None, content=b""):
        self.calls = []
        self.status, self.payload, self.content = status, payload or {}, content

    def __call__(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return SimpleNamespace(status_code=self.status, json=lambda: self.payload, content=self.content)


@pytest.fixture
def http(monkeypatch):
    import requests

    fake = FakeHTTP()
    monkeypatch.setattr(requests, "post", fake)
    return fake


# ---------------------------------------------------------------- ElevenLabs STT


def test_scribe_v2_transcription_request(monkeypatch, http):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "k")
    http.payload = {"text": " Flex cracks the solder. "}
    assert transcribe_audio(b"RIFF...", "speech.webm", "audio/webm") == "Flex cracks the solder."
    url, kwargs = http.calls[0]
    assert url == "https://api.elevenlabs.io/v1/speech-to-text"
    assert kwargs["headers"]["xi-api-key"] == "k"
    assert kwargs["data"] == {"model_id": "scribe_v2"}
    assert kwargs["files"]["file"][2] == "audio/webm"


@pytest.mark.parametrize("setup", ["no_key", "http_error", "empty_text", "empty_audio"])
def test_transcription_failures_raise_voice_unavailable(monkeypatch, http, setup):
    if setup != "no_key":
        monkeypatch.setenv("ELEVENLABS_API_KEY", "k")
    http.status = 401 if setup == "http_error" else 200
    http.payload = {"text": ""}
    with pytest.raises(VoiceUnavailable):
        transcribe_audio(b"" if setup == "empty_audio" else b"audio")


def test_edited_voice_transcript_goes_through_normal_pipeline(pcb):
    # The student fixed a mis-transcribed word before sending; the edited text is the evidence.
    result = process_teaching_turn("g", pcb, None, TeachingInput(text=FULL, modality="voice"))
    state = result["updated_brain"]
    assert state["history"][-1]["modality"] == "voice"
    assert state["brain"]["concepts"]["solder_fatigue"]["supporting_evidence"] == [FULL]
    assert result["strategy"] == "EXAMPLE"


# ---------------------------------------------------------------- ElevenLabs TTS


def test_tts_request_and_cache_by_response_id(monkeypatch, http):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "k")
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "voice123")
    http.content = b"ID3mp3"
    assert synthesize_speech("Hi teacher!", "turn-1") == b"ID3mp3"
    assert synthesize_speech("Hi teacher!", "turn-1") == b"ID3mp3"
    assert len(http.calls) == 1  # second call served from cache
    url, kwargs = http.calls[0]
    assert url.startswith("https://api.elevenlabs.io/v1/text-to-speech/voice123")
    assert kwargs["json"]["text"] == "Hi teacher!"
    synthesize_speech("Another line", "turn-2")
    assert len(http.calls) == 2


@pytest.mark.parametrize("setup", ["no_voice", "http_error", "no_audio"])
def test_tts_failures_raise_so_ui_falls_back_to_text(monkeypatch, http, setup):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "k")
    if setup != "no_voice":
        monkeypatch.setenv("ELEVENLABS_VOICE_ID", "v")
    http.status = 500 if setup == "http_error" else 200
    with pytest.raises(VoiceUnavailable):
        synthesize_speech("Hello", "turn-x")


def test_bridge_speak_and_status(monkeypatch, http):
    assert web_bridge.handle({"command": "status"}) == {
        "ok": True, "claude": False, "transcription": False, "speech": False}
    monkeypatch.setenv("ELEVENLABS_API_KEY", "k")
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "v")
    http.content = b"mp3!"
    out = web_bridge.handle({"command": "speak", "text": "Hi", "responseId": "r1"})
    assert base64.b64decode(out["audioBase64"]) == b"mp3!"


# ---------------------------------------------------------------- images


def test_image_validation():
    assert image_input(b"png", "image/jpg", "my diagram").image_media_type == "image/jpeg"
    with pytest.raises(ValueError):
        image_input(b"x", "application/pdf")
    with pytest.raises(ValueError):
        image_input(b"", "image/png")


def test_whiteboard_submission_via_bridge_is_not_proof_of_understanding():
    out = web_bridge.handle({
        "command": "turn", "game": {"id": "g", "course": {"subject": "Control"}}, "chapter": WEB_CHAPTER,
        "alexState": None, "message": "", "imageBase64": base64.b64encode(b"\x89PNG").decode(),
        "imageMediaType": "image/png", "turnId": "img-1",
    })
    assert out["ok"]
    assert out["result"]["image_observations"]
    assert all(c["level"] == 0 for c in out["webBrain"]["concepts"].values())
    assert out["alexState"]["history"][-1]["modality"] == "image"


# ---------------------------------------------------------------- toolbar actions


def taught(pcb, *messages):
    brain = None
    for message in messages:
        brain = process_teaching_turn("g", pcb, brain, message)["updated_brain"]
    return brain


def test_challenge_me_asks_application_and_judges_the_answer(pcb):
    brain = taught(pcb, FULL)
    result = run_alex_action("g", pcb, brain, "challenge")
    assert result["strategy"] == "APPLY"
    assert result["target_concept_id"] == "solder_fatigue"
    assert result["reaction"] == "thinking"
    answer = process_teaching_turn("g", pcb, result["updated_brain"],
                                   "If a car vibrates the board, the flex causes cracks so the signal drops.")
    assert answer["explanation_quality"] == "applied"
    assert answer["strategy"] == "TRANSFER"


def test_challenge_before_any_teaching_asks_to_be_taught(pcb):
    result = run_alex_action("g", pcb, None, "challenge")
    assert "haven't been taught" in result["alex_reply"]
    assert result["updated_brain"]["history"] == []


def test_actions_never_change_mastery(pcb):
    brain = taught(pcb, FULL)
    for action in ("check_memory", "teach_back", "give_example", "challenge"):
        brain = run_alex_action("g", pcb, brain, action)["updated_brain"]
        assert brain["brain"]["concepts"]["solder_fatigue"]["level"] == 2
        assert brain["brain"]["concepts"]["solder_fatigue"]["supporting_evidence"] == [FULL]


def test_teach_back_confirm_tests_application_before_moving_on(pcb):
    brain = run_alex_action("g", pcb, taught(pcb, FULL), "teach_back")["updated_brain"]
    result = process_teaching_turn("g", pcb, brain, "Yes, that's right.")
    assert result["explanation_quality"] == "confirmation"
    assert result["strategy"] == "APPLY"  # not PROGRESS: concept not yet applied


def test_teach_back_correction_uses_the_evidence_evaluator(pcb):
    teach_back = run_alex_action("g", pcb, taught(pcb, FULL), "teach_back")
    assert teach_back["strategy"] == "SUMMARISE"
    correction = process_teaching_turn(
        "g", pcb, teach_back["updated_brain"],
        "Not quite: if a circuit works while stationary, solder joints cannot be the problem.")
    assert correction["strategy"] == "CHALLENGE"
    assert correction["updated_brain"]["brain"]["concepts"]["solder_fatigue"]["misconceptions"]


def test_check_memory_returns_cards_without_api(pcb):
    result = run_alex_action("g", pcb, taught(pcb, FULL), "check_memory")
    card = next(m for m in result["memory"] if m["concept_id"] == "solder_fatigue")
    assert card["mastery_level"] == 2 and card["supporting_evidence"] == [FULL]
    assert "2/3" in result["alex_reply"]


def test_claude_actions_use_one_short_call_and_fall_back_on_error(pcb):
    class FakeMessages:
        def __init__(self):
            self.requests = []

        def parse(self, **kwargs):
            self.requests.append(kwargs)
            return SimpleNamespace(stop_reason="end_turn",
                                   parsed_output=AlexLine(alex_reply="What if the board were on a train?"))

    messages = FakeMessages()
    evaluator = ClaudeEvaluator(client=SimpleNamespace(beta=SimpleNamespace(messages=messages)))
    result = run_alex_action("g", pcb, taught(pcb, FULL), "challenge", evaluator=evaluator)
    assert result["alex_reply"] == "What if the board were on a train?"
    assert messages.requests[0]["output_format"] is AlexLine
    assert messages.requests[0]["system"][1]["cache_control"] == {"type": "ephemeral"}

    def boom(**_):
        raise ConnectionError("down")

    messages.parse = boom
    fallback = run_alex_action("g", pcb, taught(pcb, FULL), "teach_back", evaluator=evaluator)
    assert fallback["mode"] == "offline-fallback" and fallback["warnings"]
    assert fallback["alex_reply"]


def test_repeated_action_with_same_id_is_cached(pcb):
    brain = taught(pcb, FULL)
    first = run_alex_action("g", pcb, brain, "challenge", turn_id="a1")
    again = run_alex_action("g", pcb, first["updated_brain"], "challenge", turn_id="a1")
    assert again["mode"] == "cached" and again["alex_reply"] == first["alex_reply"]
    assert again["updated_brain"]["turn"] == first["updated_brain"]["turn"]


# ---------------------------------------------------------------- reactions & stats


@pytest.mark.parametrize("strategy,quality,expected", [
    ("CLARIFY", "partial", "curious"), ("CLARIFY", "vague", "confused"), ("CHALLENGE", "incorrect", "confused"),
    ("SCAFFOLD", "vague", "confused"), ("TRANSFER", "applied", "thinking"), ("APPLY", "applied", "understanding"),
    ("SUMMARISE", "applied", "understanding"), ("PROGRESS", "applied", "got_it"),
])
def test_reactions(strategy, quality, expected):
    assert reaction_for(strategy, quality, "learning") == expected


def test_turn_results_carry_reaction(pcb):
    assert process_teaching_turn("g", pcb, None, "I like pizza.")["reaction"] == "confused"


def test_template_rate_is_tracked_for_claude_turns(pcb):
    from tests.test_alex_agent import ScriptedEvaluator, model_output

    good = model_output("solder_fatigue", "definition_only", "EXAMPLE", evidence=[FULL], reply="An example please?")
    bad = model_output("solder_fatigue", "applied", "PROGRESS", evidence=[FULL], reply="Next topic?")
    r1 = process_teaching_turn("g", pcb, None, FULL, evaluator=ScriptedEvaluator(good))
    r2 = process_teaching_turn("g", pcb, r1["updated_brain"], FULL + " For example a cable.",
                               evaluator=ScriptedEvaluator(bad))
    assert r1["reply_source"] == "model" and r2["reply_source"] == "template"
    assert r2["template_rate"] == 0.5


# ---------------------------------------------------------------- web bridge


def bridge_turn(message, state=None, **extra):
    return web_bridge.handle({"command": "turn", "game": {"id": "g", "course": {"subject": "Control"}},
                              "chapter": WEB_CHAPTER, "alexState": state, "message": message, **extra})


def test_bridge_returns_web_brain_in_existing_contract():
    out = bridge_turn("Proportional gain multiplies the error so the response is faster.", turnId="w1")
    concepts = out["webBrain"]["concepts"]
    assert set(concepts) == {"proportional-gain", "overshoot-trade-off"}  # web conceptId slugs
    card = concepts["proportional-gain"]
    assert set(card) == {"conceptId", "label", "level", "evidence", "missingPoints", "misconceptions",
                         "confidence", "lastUpdatedTurn"}
    assert out["webBrain"]["chapterWeek"] == 1
    assert out["result"]["target_concept_id"] in concepts


def test_bridge_weak_grounding_caps_mastery_at_two():
    state = None
    for message in ["Proportional gain multiplies the error, so for example a heater with high gain heats fast.",
                    "If gain is high then the room overshoots, which leads to oscillation, for example."] * 2:
        state = bridge_turn(message, state)["alexState"]
    assert state["brain"]["concepts"]["proportional_gain"]["level"] <= 2


def test_bridge_maps_web_feedback_ids_and_dedupes_turns():
    out = bridge_turn("Hi", turnId="f1", feedback={
        "failedConcepts": ["overshoot-trade-off"], "alexMistake": "I thought more gain was always better.",
        "recommendedRevision": "Re-explain Overshoot trade-off"})
    assert out["result"]["target_concept_id"] == "overshoot-trade-off"
    assert "always better" in out["result"]["alex_reply"]
    again = bridge_turn("Hi", out["alexState"], turnId="f1")
    assert again["result"]["mode"] == "cached"


def test_bridge_cli_returns_json_errors_not_tracebacks():
    proc = subprocess.run([sys.executable, "-m", "purple.web_bridge"], input='{"command":"nope"}',
                          capture_output=True, text=True, cwd=ROOT, timeout=60,
                          env={"ALEX_OFFLINE": "1", "ALEX_IGNORE_ENV_FILE": "1", "PATH": ""})
    out = json.loads(proc.stdout)
    assert out["ok"] is False and "nope" in out["error"]
