"use client";

import { useEffect, useRef, useState } from "react";
import type { TeachingMessage } from "@/features/purple-shared/types";
import { PixelButton } from "@/components/pixel/PixelButton";

type Phase = "idle" | "greeting" | "listening" | "transcribing" | "thinking" | "speaking";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Ready",
  greeting: "Alex is saying hello… (talk over him or say “stop” to cut in)",
  listening: "Listening… talk to Alex, then pause",
  transcribing: "Catching what you said…",
  thinking: "Alex is thinking…",
  speaking: "Alex is talking… (talk over him or say “stop” to cut in)",
};

// Simple voice-activity detection on the mic level.
const SPEAKING_RMS = 0.03; // louder than this = you're talking
const END_SILENCE_MS = 1400; // a pause this long ends your turn
const NO_SPEECH_MS = 15000; // nothing heard for this long = skip the turn
const MAX_TURN_MS = 45000;

// Interrupting Alex ("barge-in"): louder than normal speech so Alex's own voice
// through the speakers doesn't trigger it (headphones work best).
const BARGE_RMS = 0.08;
const BARGE_MS = 450;
const STOP_WORDS = /\b(shut up|stop|be quiet|quiet|hold on|wait)\b/;

/** Minimal typing for the browser's built-in speech recognition (Chrome, Edge, Safari). */
type Recognizer = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/** Listens for "shut up" / "stop" / "wait"… while Alex talks. Returns null if the browser can't. */
function startStopWordListener(onStop: () => void): Recognizer | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
  const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-GB";
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (STOP_WORDS.test(e.results[i][0].transcript.toLowerCase())) onStop();
    }
  };
  rec.onerror = () => undefined;
  try {
    rec.start();
  } catch {
    return null;
  }
  return rec;
}

/**
 * Live stand-up: a hands-free spoken conversation with Alex.
 * Listen (until you pause) → transcribe → Alex replies (Agent 3) → Alex speaks → listen again.
 * Uses the same ElevenLabs transcription / speech and Agent 3 turns as the rest of the room.
 */
export function StandupPanel(props: {
  available: boolean;
  speechOn: boolean;
  messages: TeachingMessage[];
  busy: boolean;
  greet: () => Promise<void>;
  transcribe: (audioBase64: string, mime: string) => Promise<string | null>;
  teachLive: (text: string) => Promise<void>;
  waitForAlex: () => Promise<void>;
  skipAlex: () => void;
  onLiveChange: (live: boolean) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [level, setLevel] = useState(0);
  const [note, setNote] = useState("");
  const [startIndex, setStartIndex] = useState(0);

  // Latest props for the async loop (avoids stale closures between turns).
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  const active = useRef(false);
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);

  useEffect(() => () => stopSession(), []);

  function rms(): number {
    const a = analyser.current;
    if (!a) return 0;
    const buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    return Math.sqrt(sum / buf.length);
  }

  /** Records one turn; resolves with the audio once you pause, or null if nothing was said. */
  function listenOnce(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!stream.current) return resolve(null);
      const rec = new MediaRecorder(stream.current);
      const chunks: Blob[] = [];
      const t0 = performance.now();
      let heard = false;
      let lastLoud = t0;
      let raf = 0;

      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        cancelAnimationFrame(raf);
        setLevel(0);
        resolve(heard && chunks.length ? new Blob(chunks, { type: rec.mimeType || "audio/webm" }) : null);
      };

      const tick = () => {
        if (!active.current) return rec.state !== "inactive" && rec.stop();
        const now = performance.now();
        const v = rms();
        setLevel(Math.min(1, v * 12));
        if (v > SPEAKING_RMS) {
          heard = true;
          lastLoud = now;
        }
        const done =
          (heard && now - lastLoud > END_SILENCE_MS) || (!heard && now - t0 > NO_SPEECH_MS) || now - t0 > MAX_TURN_MS;
        if (done) rec.stop();
        else raf = requestAnimationFrame(tick);
      };

      recorder.current = rec;
      rec.start(250);
      raf = requestAnimationFrame(tick);
    });
  }

  async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Waits for Alex to finish talking, unless you interrupt:
   * talking over him (mic level) or saying a stop word. Interrupting cuts his audio.
   */
  async function untilAlexDone(): Promise<"done" | "interrupted"> {
    let cleanup = () => {};
    const interrupted = new Promise<"interrupted">((resolve) => {
      let loudSince = 0;
      let raf = 0;
      const tick = () => {
        if (!active.current) return;
        const now = performance.now();
        const v = rms();
        if (v > BARGE_RMS) {
          loudSince ||= now;
          if (now - loudSince > BARGE_MS) return resolve("interrupted");
        } else loudSince = 0;
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      const words = startStopWordListener(() => resolve("interrupted"));
      cleanup = () => {
        cancelAnimationFrame(raf);
        try {
          words?.stop();
        } catch {
          /* already stopped */
        }
      };
    });
    const result = await Promise.race([latest.current.waitForAlex().then(() => "done" as const), interrupted]);
    cleanup();
    if (result === "interrupted") {
      latest.current.skipAlex();
      setNote("Okay, Alex stopped. Go ahead.");
    }
    return result;
  }

  async function startSession() {
    setNote("");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setNote("Microphone unavailable. Allow microphone access in your browser and try again.");
      return;
    }
    audioCtx.current = new AudioContext();
    analyser.current = audioCtx.current.createAnalyser();
    analyser.current.fftSize = 1024;
    audioCtx.current.createMediaStreamSource(stream.current).connect(analyser.current);

    active.current = true;
    setStartIndex(latest.current.messages.length);
    latest.current.onLiveChange(true);

    setPhase("greeting");
    const greeting = latest.current.greet(); // starts Alex's hello; resolves when it ends
    await untilAlexDone();
    await greeting;

    let silentTurns = 0;
    while (active.current) {
      setPhase("listening");
      const blob = await listenOnce();
      if (!active.current) break;

      if (!blob) {
        silentTurns += 1;
        if (silentTurns >= 2) {
          setNote("I didn't hear anything for a while, so the stand-up paused.");
          break;
        }
        setNote("I didn't catch anything. Go ahead whenever you're ready.");
        continue;
      }
      silentTurns = 0;
      setNote("");

      setPhase("transcribing");
      const text = await latest.current.transcribe(await blobToBase64(blob), blob.type);
      if (!active.current) break;
      if (!text?.trim()) {
        setNote("Sorry, I couldn't make that out. Try again a bit closer to the mic.");
        continue;
      }

      setPhase("thinking");
      await latest.current.teachLive(text.trim());
      if (!active.current) break;

      setPhase("speaking");
      await untilAlexDone();
    }
    stopSession();
  }

  function stopSession() {
    active.current = false;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audioCtx.current?.close().catch(() => undefined);
    audioCtx.current = null;
    analyser.current = null;
    latest.current.skipAlex();
    latest.current.onLiveChange(false);
    setPhase("idle");
    setLevel(0);
  }

  if (!props.available) {
    return (
      <p className="text-lg text-px-muted">
        Live stand-up needs ElevenLabs voice. Add <code>ELEVENLABS_API_KEY</code> (and <code>ELEVENLABS_VOICE_ID</code> so Alex
        can talk back) to <code>apps/web/.env.local</code>.
      </p>
    );
  }

  const live = phase !== "idle";
  const turns = props.messages.slice(startIndex);

  return (
    <div className="space-y-4">
      {!live ? (
        <div className="space-y-3">
          <p className="text-xl leading-snug">
            A quick spoken check-in. Explain this chapter to Alex out loud. He listens, answers with his voice, and asks you
            the next question. No typing, no buttons: just pause when you&apos;ve finished a thought.
          </p>
          <p className="text-lg text-px-muted">
            Want Alex to stop talking? Talk over him, or say “stop” or “shut up”. Headphones work best.
          </p>
          {!props.speechOn && (
            <p className="text-lg text-px-gold">Alex&apos;s voice is off, so his replies will appear as text.</p>
          )}
          <PixelButton size="lg" onClick={startSession} disabled={props.busy}>
            ● Start stand-up
          </PixelButton>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-5">
            <MicMeter level={phase === "listening" ? level : 0} phase={phase} />
            <div className="flex-1">
              <p role="status" className={`font-pixel text-[0.6rem] leading-relaxed ${phase === "listening" ? "text-px-mint" : "text-px-gold"}`}>
                {PHASE_LABEL[phase]}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {phase === "speaking" && (
                  <PixelButton variant="ghost" onClick={() => props.skipAlex()}>
                    ⏭ Skip Alex
                  </PixelButton>
                )}
                <PixelButton variant="ghost" onClick={stopSession}>
                  ■ End stand-up
                </PixelButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {note && (
        <p role="status" className="text-lg text-px-gold">
          {note}
        </p>
      )}

      {turns.length > 0 && (
        <div className="max-h-72 space-y-3 overflow-y-auto bg-px-night/40 p-3" aria-label="Stand-up transcript">
          {turns.map((m) => (
            <div key={m.id} className={`flex ${m.role === "student" ? "justify-end" : "justify-start"}`}>
              <p className={`max-w-[85%] p-3 text-xl ${m.role === "student" ? "bg-[#493b70]" : "bg-px-night"}`}>
                <span className="block font-pixel text-[0.45rem] text-px-muted">{m.role === "student" ? "YOU" : "ALEX"}</span>
                {m.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Pixel equaliser: bars follow your voice while listening; pulses while Alex works. */
function MicMeter({ level, phase }: { level: number; phase: Phase }) {
  const bars = [0.5, 0.8, 1, 0.7, 0.9, 0.6, 0.4];
  const listening = phase === "listening";
  return (
    <div
      aria-hidden
      className={`px-frame flex h-20 w-32 items-end justify-center gap-1 bg-px-night p-2 ${
        listening ? "[--px-b:var(--px-mint)]" : "anim-glow [--px-b:var(--px-gold)]"
      }`}
    >
      {bars.map((b, i) => (
        <span
          key={i}
          className={listening ? "bg-px-mint" : "bg-px-gold"}
          style={{ width: 8, height: `${Math.max(10, (listening ? level * b : 0.25 + 0.15 * (i % 3)) * 100)}%` }}
        />
      ))}
    </div>
  );
}
