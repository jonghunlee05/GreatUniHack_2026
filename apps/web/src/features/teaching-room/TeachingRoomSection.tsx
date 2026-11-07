"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Game } from "@/lib/game-schema";
import type { AlexReaction } from "@/components/pixel/AlexSprite";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelPanel } from "@/components/pixel/PixelPanel";
import { evaluateTeaching } from "@/features/purple-shared/engine";
import { chapterKey, type BrainState, type TeachingMessage } from "@/features/purple-shared/types";
import { usePurpleState } from "@/features/purple-shared/state";
import { ChapterRail, chapterProgress, markProgress } from "@/features/purple-shared/progression";
import { Whiteboard, type ImageSubmission } from "./Whiteboard";
import { ModeTabs, RoomScene, type ZoneId } from "./RoomScene";
import { BrainPanel } from "./BrainPanel";
import { StandupPanel } from "./StandupPanel";

const REACTIONS: AlexReaction[] = ["curious", "confused", "thinking", "understanding", "got_it"];
const STRATEGY_LABEL: Record<string, string> = {
  CLARIFY: "CLARIFY", CHALLENGE: "CHALLENGE", EXAMPLE: "EXAMPLE", APPLY: "APPLY", TRANSFER: "TRANSFER",
  SUMMARISE: "SUMMARISE", SCAFFOLD: "SCAFFOLD", PROGRESS: "PROGRESS",
};

type Status = { claude: boolean; transcription: boolean; speech: boolean };
type AlexResult = {
  turn_id: string; alex_reply: string; strategy: string; reaction?: string; readiness?: string;
  mode: string; warnings?: string[]; memory?: unknown;
};
type BridgeOk = { ok: true; result: AlexResult; alexState: unknown; webBrain: BrainState };
type Submission = { text: string; modality: "text" | "voice" | "image"; image?: ImageSubmission };

async function callAlex(body: object) {
  const response = await fetch("/api/alex", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (await response.json()) as { ok: boolean; error?: string } & Record<string, unknown>;
}

function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function TeachingRoomSection({ game }: { game: Game }) {
  const router = useRouter();
  const { state, update, ready } = usePurpleState(game);
  const [draft, setDraft] = useState("");
  const [draftIsTranscript, setDraftIsTranscript] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [muted, setMuted] = useState(() => {
    try { return typeof window !== "undefined" && window.localStorage.getItem("teachback:alex:muted") === "1"; } catch { return false; }
  });
  const [recording, setRecording] = useState(false);
  const [selectedZone, setSelectedZone] = useState<ZoneId>("desk");
  const [unlockedMessage, setUnlockedMessage] = useState("");
  const [openCards, setOpenCards] = useState(false);
  const [live, setLive] = useState(false);
  const [bubbleOverride, setBubbleOverride] = useState<string | null>(null);
  const currentAudio = useRef<HTMLAudioElement | null>(null);
  const lastSpeech = useRef<Promise<void>>(Promise.resolve());
  const speechGen = useRef(0); // bumped by skipAlex() so a reply still downloading never starts playing
  const chatEnd = useRef<HTMLDivElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const audioCache = useRef(new Map<string, string>());
  const inflight = useRef(new Set<string>());
  const input = useRef<HTMLTextAreaElement>(null);

  const chapter = useMemo(() => game.chapters.find((item) => item.week === state.currentChapterWeek) ?? game.chapters[0], [game.chapters, state.currentChapterWeek]);
  const key = chapterKey(chapter.week);
  const brain = state.brains[key];
  const messages = state.conversations[key] ?? [];
  const alexState = state.alexStates?.[key] ?? null;
  const progress = Object.values(brain.concepts).reduce((sum, item) => sum + item.level, 0) / Math.max(1, Object.keys(brain.concepts).length * 3);
  const lastAlex = [...messages].reverse().find((m) => m.role === "alex");
  const reaction: AlexReaction = pending ? "thinking" : REACTIONS.includes(lastAlex?.reaction as AlexReaction) ? (lastAlex?.reaction as AlexReaction) : "curious";
  const chapterState = chapterProgress(game, state)[chapter.week];
  const offerTeachBackReplies = lastAlex?.strategy === "SUMMARISE" && !pending;

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, selectedZone]);

  useEffect(() => {
    callAlex({ command: "status" }).then((r) => r.ok && setStatus(r as unknown as Status)).catch(() => setStatus(null));
  }, []);

  function toggleMute() {
    setMuted((value) => {
      try { window.localStorage.setItem("teachback:alex:muted", value ? "0" : "1"); } catch { /* ignore */ }
      if (!value) document.querySelectorAll("audio[data-alex]").forEach((a) => (a as HTMLAudioElement).pause());
      return !value;
    });
  }

  /** Plays Alex's reply. Resolves when the audio ends (or right away if voice is off), so the stand-up can wait for it. */
  function speak(text: string, responseId: string, force = false): Promise<void> {
    const gen = speechGen.current;
    const done = (async () => {
      if (!status?.speech || (muted && !force)) return;
      try {
        let url = audioCache.current.get(responseId);
        if (!url) {
          const r = await callAlex({ command: "speak", text, responseId });
          if (!r.ok) return; // voice is optional: text stays visible
          url = `data:audio/mpeg;base64,${r.audioBase64 as string}`;
          audioCache.current.set(responseId, url);
        }
        if (gen !== speechGen.current) return; // interrupted while downloading
        const audio = new Audio(url);
        audio.dataset.alex = "1";
        currentAudio.current = audio;
        await new Promise<void>((resolve) => {
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
          audio.onpause = () => resolve();
          audio.play().catch(() => resolve());
        });
      } catch { /* autoplay blocked or ElevenLabs down: text fallback */ }
    })();
    lastSpeech.current = done;
    return done;
  }

  // ---- Live stand-up helpers (reuse transcribe / teach / speak) ----
  const voiceOn = Boolean(status?.speech) && !muted;
  const readingPause = () => new Promise<void>((r) => setTimeout(r, 1800));

  async function greetStandup() {
    const line = `Stand-up time! Tell me what you know about ${chapter.title}. I'm listening. Pause when you've finished a thought.`;
    setBubbleOverride(line);
    await speak(line, `standup-intro-${key}`);
    if (!voiceOn) await readingPause();
  }

  async function transcribeAudio(audioBase64: string, mime: string): Promise<string | null> {
    const r = await callAlex({ command: "transcribe", audioBase64, mime }).catch(() => ({ ok: false, error: "network" }) as const);
    if (!r.ok) {
      setError(`Couldn't transcribe (${r.error}).`);
      return null;
    }
    setError("");
    return String((r as Record<string, unknown>).text ?? "");
  }

  async function waitForAlex() {
    await lastSpeech.current;
    if (!voiceOn) await readingPause();
  }

  function skipAlex() {
    speechGen.current += 1;
    currentAudio.current?.pause();
  }

  function apply(r: BridgeOk, student?: TeachingMessage) {
    setBubbleOverride(null);
    const alexMessage: TeachingMessage = {
      id: `alex-${r.result.turn_id}`, role: "alex", text: r.result.alex_reply,
      strategy: r.result.strategy, reaction: r.result.reaction,
    };
    update((current) => {
      const existing = current.conversations[key] ?? [];
      if (existing.some((m) => m.id === alexMessage.id)) return current; // duplicate response
      return {
        ...current,
        repairTarget: null,
        brains: { ...current.brains, [key]: r.webBrain },
        alexStates: { ...(current.alexStates ?? {}), [key]: r.alexState },
        conversations: { ...current.conversations, [key]: [...existing, ...(student ? [student] : []), alexMessage] },
      };
    });
    if (r.result.mode.startsWith("offline")) setNotice(r.result.warnings?.[0] ?? "Alex is in offline demo mode.");
    void speak(r.result.alex_reply, r.result.turn_id);
  }

  function repairFeedback() {
    if (!state.repairTarget) return undefined;
    const attempt = state.attempts[key] ?? state.previousAttempts.at(-1);
    const failed = attempt?.decisions.find((d) => !d.success);
    const label = brain.concepts[state.repairTarget]?.label ?? state.repairTarget;
    return { failedConcepts: [state.repairTarget], alexMistake: failed?.reasoning ?? "", recommendedRevision: `Re-explain ${label}` };
  }

  async function teach(submission: Submission) {
    const text = submission.text.trim();
    if ((!text && !submission.image) || pending) return;
    const turnId = `${game.id}-${key}-${messages.length}-${hash(text + (submission.image?.base64.slice(0, 200) ?? ""))}`;
    if (inflight.current.has(turnId)) return; // double click
    inflight.current.add(turnId);
    setPending("turn"); setError("");
    const student: TeachingMessage = {
      id: `student-${turnId}`, role: "student", modality: submission.modality,
      text: submission.image ? `🖼️ ${text || "(drawing)"}` : text,
    };
    try {
      const r = await callAlex({
        command: "turn", gameId: game.id, chapterWeek: chapter.week, alexState, turnId,
        message: text, modality: submission.modality,
        imageBase64: submission.image?.base64, imageMediaType: submission.image?.mediaType,
        history: messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
        feedback: repairFeedback(),
      });
      if (r.ok) {
        apply(r as unknown as BridgeOk, student);
      } else if (!submission.image) {
        // Agent 3 unreachable: keep text teaching playable with the local evaluator.
        const { nextBrain, evaluation } = evaluateTeaching(chapter, brain, text);
        update((current) => ({
          ...current, repairTarget: null, brains: { ...current.brains, [key]: nextBrain },
          conversations: { ...current.conversations, [key]: [...(current.conversations[key] ?? []), student,
            { id: `alex-local-${turnId}`, role: "alex", text: evaluation.nextQuestion, reaction: "curious" }] },
        }));
        setNotice(`Alex's AI is unavailable (${r.error ?? "error"}); using the simple local evaluator.`);
      } else {
        setError(r.error ?? "Alex couldn't look at that image. Try describing it in words.");
        return;
      }
      setDraft(""); setDraftIsTranscript(false);
    } catch {
      setError("Couldn't reach Alex. Check that the dev server is running.");
    } finally {
      setPending(null);
      inflight.current.delete(turnId);
    }
  }

  async function runAction(action: "challenge" | "teach_back" | "give_example" | "check_memory") {
    if (pending) return;
    const turnId = `${game.id}-${key}-${messages.length}-${action}`;
    setPending(action); setError("");
    try {
      const r = await callAlex({ command: "action", action, gameId: game.id, chapterWeek: chapter.week, alexState, turnId });
      if (r.ok) {
        apply(r as unknown as BridgeOk);
        if (action === "check_memory") setOpenCards(true);
      } else setError(r.error ?? "Alex couldn't do that right now.");
    } catch {
      setError("Couldn't reach Alex.");
    } finally {
      setPending(null);
    }
  }

  async function toggleRecording() {
    if (recording) { recorder.current?.stop(); return; }
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
          reader.readAsDataURL(blob);
        });
        setPending("transcribe");
        const r = await callAlex({ command: "transcribe", audioBase64: base64, mime: blob.type }).catch(() => ({ ok: false, error: "network" }));
        setPending(null);
        if (r.ok) {
          setDraft(String((r as Record<string, unknown>).text ?? ""));
          setDraftIsTranscript(true);
          input.current?.focus();
        } else setError(`Couldn't transcribe (${r.error}). Type your explanation instead.`);
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("Microphone unavailable. Type your explanation instead.");
    }
  }

  function chooseChapter(week: number) {
    if (!chapterProgress(game, state)[week]?.teachingUnlocked) return; // locked chapters can't be entered
    update((current) => ({ ...current, currentChapterWeek: week, repairTarget: null }));
    setNotice(""); setError(""); setUnlockedMessage("");
  }

  function finishTeachingChapter() {
    update((current) => markProgress(current, chapter.week, "teachingCompleted"));
    setUnlockedMessage(`🔓 Assessment for Week ${chapter.week} unlocked!`);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void teach({ text: draft, modality: draftIsTranscript ? "voice" : "text" });
  }

  if (!ready) return <PixelPanel><p>Loading Alex&apos;s memory...</p></PixelPanel>;

  const bubble = pending
    ? pending === "transcribe" ? "Listening back to what you said…" : "Hmm, let me think…"
    : bubbleOverride ?? lastAlex?.text ?? "I'm listening. Teach me one cause-and-effect idea at a time.";
  const selectZone = (zone: ZoneId) => { if (!live) setSelectedZone(zone); };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="font-pixel text-lg leading-relaxed text-px-violet">Teaching room</h2>
        <p className="text-xl text-px-cream">Week {chapter.week} · {chapter.title}</p>
        <p className="text-lg text-px-muted">Goal: {chapter.ilos[0]?.statement ?? chapter.summary}</p>
      </header>

      <ChapterRail game={game} state={state} mode="teaching" currentWeek={chapter.week} onSelect={chooseChapter} />

      {state.repairTarget && (
        <PixelPanel tone="danger">
          <p className="font-pixel text-[0.6rem]">REPAIR MISSION</p>
          <p className="mt-2">Give Alex new evidence for {brain.concepts[state.repairTarget]?.label}. Opening this room did not increase mastery.</p>
        </PixelPanel>
      )}
      {status && !status.claude && (
        <PixelPanel tone="danger">
          <p className="font-pixel text-[0.6rem]">OFFLINE DEMO</p>
          <p className="mt-2">No Claude API key found, so Alex uses a simple keyword evaluator. Add ANTHROPIC_API_KEY to apps/web/.env.local and restart.</p>
        </PixelPanel>
      )}
      {notice && <p className="text-px-gold" role="status">{notice}</p>}

      {!chapterState.teachingUnlocked ? (
        <PixelPanel tone="danger">
          <p className="font-pixel text-[0.65rem]">🔒 CHAPTER LOCKED</p>
          <p className="mt-2">Pass the previous chapter&apos;s assessment to unlock Week {chapter.week}.</p>
        </PixelPanel>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_19rem]">
          <div className="space-y-4">
            <RoomScene selected={selectedZone} onSelect={selectZone} reaction={reaction} bubble={bubble} live={live} />
            <ModeTabs selected={selectedZone} onSelect={selectZone} />

            <div data-testid="zone-panel">
              <PixelPanel className="[--px-b:var(--px-gold)]">
                {selectedZone === "desk" && (
                  <div className="space-y-4">
                    <div className="max-h-80 space-y-3 overflow-y-auto bg-px-night/40 p-3" aria-label="Conversation with Alex">
                      {messages.length === 0 && <p className="text-lg text-px-muted">Start by explaining one idea from this chapter. Alex will ask follow-up questions.</p>}
                      {messages.map((message) => (
                        <div key={message.id} className={`flex ${message.role === "student" ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[85%] p-3 ${message.role === "student" ? "bg-[#493b70]" : "bg-px-night"}`}>
                            <p className="font-pixel text-[0.45rem] text-px-muted">
                              {message.role === "student" ? `YOU${message.modality === "voice" ? " · VOICE" : ""}` : "ALEX"}
                              {message.strategy && <span className="ml-2 text-px-violet">· {STRATEGY_LABEL[message.strategy] ?? message.strategy}</span>}
                            </p>
                            <p className="mt-1 text-xl">{message.text}</p>
                          </div>
                        </div>
                      ))}
                      <div ref={chatEnd} />
                    </div>

                    {offerTeachBackReplies && (
                      <div className="flex flex-wrap gap-3" aria-label="Respond to Alex's teach-back">
                        <PixelButton onClick={() => teach({ text: "Yes, that's right.", modality: "text" })}>That&apos;s right</PixelButton>
                        <PixelButton variant="ghost" onClick={() => { setDraft("Not quite: "); input.current?.focus(); }}>Correct Alex</PixelButton>
                        <PixelButton variant="ghost" onClick={() => runAction("give_example")}>Another example</PixelButton>
                      </div>
                    )}

                    <form onSubmit={submit} className="space-y-3">
                      <label htmlFor="purple-teaching-input" className="sr-only">Your explanation</label>
                      <textarea
                        id="purple-teaching-input"
                        ref={input}
                        value={draft}
                        onChange={(event) => { setDraft(event.target.value); setDraftIsTranscript(false); }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (draft.trim() && !pending) void teach({ text: draft, modality: draftIsTranscript ? "voice" : "text" }); }
                        }}
                        className="px-input px-frame min-h-24 resize-y"
                        placeholder="Explain why it works, not only what it is… (Enter to send)"
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <PixelButton type="submit" disabled={!draft.trim() || !!pending}>{pending === "turn" ? "Alex is thinking…" : "Teach Alex"}</PixelButton>
                        <span className="text-lg text-px-muted">or ask Alex to:</span>
                        <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Alex actions">
                          <ActionChip disabled={!!pending} onClick={() => runAction("teach_back")}>Teach it back</ActionChip>
                          <ActionChip disabled={!!pending} onClick={() => runAction("give_example")}>Give an example</ActionChip>
                          <ActionChip disabled={!!pending} onClick={() => runAction("challenge")}>Challenge me</ActionChip>
                          <ActionChip disabled={!!pending} onClick={() => runAction("check_memory")}>Check memory</ActionChip>
                        </div>
                      </div>
                    </form>
                  </div>
                )}

                {selectedZone === "blackboard" && (
                  <Whiteboard disabled={!!pending} onSubmit={(image) => teach({ text: image.note, modality: "image", image })} />
                )}

                {selectedZone === "sofa" && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-3">
                      <PixelButton disabled={(!status?.transcription && !recording) || (!!pending && !recording)} onClick={toggleRecording} title={status?.transcription ? undefined : "Add ELEVENLABS_API_KEY to enable voice"}>
                        {recording ? "⏹ Stop recording" : pending === "transcribe" ? "Transcribing…" : "🎙 Record explanation"}
                      </PixelButton>
                      {status?.speech && <PixelButton variant="ghost" onClick={toggleMute} aria-pressed={muted}>{muted ? "🔇 Alex's voice off" : "🔊 Alex's voice on"}</PixelButton>}
                    </div>
                    {!status?.transcription && <p className="text-px-muted">Voice needs ELEVENLABS_API_KEY. You can still type below.</p>}
                    <form onSubmit={submit} className="space-y-3">
                      <label htmlFor="purple-voice-transcript" className="font-pixel text-[0.55rem] text-px-violet">CHECK YOUR TRANSCRIPT</label>
                      <textarea id="purple-voice-transcript" ref={input} value={draft} onChange={(event) => setDraft(event.target.value)} className="px-input px-frame min-h-24 resize-y" placeholder="Record, then fix any mistakes before sending…" />
                      <PixelButton type="submit" disabled={!draft.trim() || !!pending}>{pending === "turn" ? "Alex is thinking…" : "Send to Alex"}</PixelButton>
                    </form>
                    {lastAlex && status?.speech && lastAlex.strategy && !lastAlex.id.startsWith("alex-local") && (
                      <PixelButton variant="ghost" onClick={() => speak(lastAlex.text, lastAlex.id.slice(5), true)}>▶ Replay Alex&apos;s last reply</PixelButton>
                    )}
                  </div>
                )}

                {selectedZone === "standup" && (
                  <StandupPanel
                    available={Boolean(status?.transcription)}
                    speechOn={voiceOn}
                    messages={messages}
                    busy={!!pending}
                    greet={greetStandup}
                    transcribe={transcribeAudio}
                    teachLive={(text) => teach({ text, modality: "voice" })}
                    waitForAlex={waitForAlex}
                    skipAlex={skipAlex}
                    onLiveChange={setLive}
                  />
                )}
              </PixelPanel>
            </div>
            {error && <p className="text-px-red" role="alert">{error}</p>}

            <div className="flex flex-wrap items-center justify-end gap-3">
              {unlockedMessage && <p className="text-px-mint" role="status">{unlockedMessage}</p>}
              {chapterState.teachingCompleted ? (
                <PixelButton size="lg" onClick={() => router.push(`/games/${game.id}/assessment-room`)}>Go to Assessment → Week {chapter.week}</PixelButton>
              ) : (
                <PixelButton size="lg" onClick={finishTeachingChapter} disabled={live}>Finish Teaching Chapter</PixelButton>
              )}
            </div>
          </div>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <BrainPanel brain={brain} progress={progress} repairTarget={state.repairTarget} openAll={openCards} />
          </aside>
        </div>
      )}
    </div>
  );
}

/** Small secondary button for Alex's actions. */
function ActionChip({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-frame m-1 bg-px-wall-line px-2 py-1 text-lg text-px-cream [--px-b:var(--px-ink)] hover:text-px-gold disabled:opacity-50"
    >
      {children}
    </button>
  );
}
