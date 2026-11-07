"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Game } from "@/lib/game-schema";
import { AlexSprite, type AlexReaction } from "@/components/pixel/AlexSprite";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelPanel, SpeechBubble } from "@/components/pixel/PixelPanel";
import { evaluateTeaching } from "@/features/purple-shared/engine";
import { chapterKey, type BrainState, type KnowledgeLevel, type TeachingMessage } from "@/features/purple-shared/types";
import { usePurpleState } from "@/features/purple-shared/state";
import { ChapterRail, chapterProgress, markProgress } from "@/features/purple-shared/progression";
import { Whiteboard, type ImageSubmission } from "./Whiteboard";

type ZoneId = "blackboard" | "desk" | "sofa";
// Hotspots in the room scene, Alex's standing spot, and the floating panel title.
const ZONES: { id: ZoneId; label: string; hint: string; title: string; box: string; alexLeft: string; art: React.ReactNode }[] = [
  {
    id: "blackboard", label: "Blackboard", hint: "draw a diagram", title: "BLACKBOARD · DRAW OR SHOW AN IMAGE",
    box: "left-[4%] top-[12%] h-[42%] w-[32%]", alexLeft: "40%",
    art: (
      <span className="absolute inset-0 border-4 border-px-wood bg-[#2f4a3a]">
        <span className="absolute left-[12%] top-[25%] h-1 w-[45%] bg-px-cream/70" />
        <span className="absolute left-[12%] top-[45%] h-1 w-[30%] bg-px-cream/70" />
        <span className="absolute right-[12%] top-[30%] h-6 w-6 border-2 border-px-cream/70" />
      </span>
    ),
  },
  {
    id: "desk", label: "Desk", hint: "type and chat", title: "DESK · TEACH BY TEXT",
    box: "left-[42%] bottom-[12%] h-[30%] w-[22%]", alexLeft: "56%",
    art: (
      <span className="absolute inset-0">
        <span className="absolute inset-x-0 top-[30%] h-[18%] bg-px-wood" />
        <span className="absolute left-[6%] top-[48%] h-[52%] w-[8%] bg-px-wood-dark" />
        <span className="absolute right-[6%] top-[48%] h-[52%] w-[8%] bg-px-wood-dark" />
        <span className="absolute left-[20%] top-[10%] h-[20%] w-[22%] bg-px-cream" />
        <span className="absolute right-[18%] top-0 h-[30%] w-[14%] bg-px-gold" />
      </span>
    ),
  },
  {
    id: "sofa", label: "Sofa", hint: "talk out loud", title: "SOFA · TEACH BY VOICE",
    box: "right-[4%] bottom-[12%] h-[34%] w-[26%]", alexLeft: "70%",
    art: (
      <span className="absolute inset-0">
        <span className="absolute inset-x-[8%] top-0 h-[45%] bg-[#6b5bb5]" />
        <span className="absolute inset-x-0 top-[40%] h-[35%] bg-[#7d6cd0]" />
        <span className="absolute left-0 top-[25%] h-[55%] w-[10%] bg-[#5a4b9e]" />
        <span className="absolute right-0 top-[25%] h-[55%] w-[10%] bg-[#5a4b9e]" />
        <span className="absolute left-[10%] bottom-0 h-[25%] w-[6%] bg-px-ink" />
        <span className="absolute right-[10%] bottom-0 h-[25%] w-[6%] bg-px-ink" />
      </span>
    ),
  },
];

const LEVELS = ["Not learned", "Recognised", "Understood", "Applied"];
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

function LevelPips({ level }: { level: KnowledgeLevel }) {
  return (
    <span className="flex gap-1" aria-label={`${LEVELS[level]}, level ${level} of 3`}>
      {[1, 2, 3].map((pip) => <span key={pip} className={`h-3 w-6 ${pip <= level ? "bg-px-violet" : "bg-px-wall-line"}`} />)}
    </span>
  );
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
    callAlex({ command: "status" }).then((r) => r.ok && setStatus(r as unknown as Status)).catch(() => setStatus(null));
  }, []);

  function toggleMute() {
    setMuted((value) => {
      try { window.localStorage.setItem("teachback:alex:muted", value ? "0" : "1"); } catch { /* ignore */ }
      if (!value) document.querySelectorAll("audio[data-alex]").forEach((a) => (a as HTMLAudioElement).pause());
      return !value;
    });
  }

  async function speak(text: string, responseId: string, force = false) {
    if (!status?.speech || (muted && !force)) return;
    try {
      let url = audioCache.current.get(responseId);
      if (!url) {
        const r = await callAlex({ command: "speak", text, responseId });
        if (!r.ok) return; // voice is optional: text stays visible
        url = `data:audio/mpeg;base64,${r.audioBase64 as string}`;
        audioCache.current.set(responseId, url);
      }
      const audio = new Audio(url);
      audio.dataset.alex = "1";
      await audio.play();
    } catch { /* autoplay blocked or ElevenLabs down: text fallback */ }
  }

  function apply(r: BridgeOk, student?: TeachingMessage) {
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

  return (
    <div className="grid gap-6 lg:grid-cols-[19rem_1fr]">
      <aside className="space-y-5">
        <PixelPanel className="[--px-b:var(--px-violet)]">
          <p className="font-pixel text-[0.6rem] text-px-violet">TEACHING ROOM</p>
          <p className="mt-4 text-px-muted">Week {chapter.week}</p>
          <p className="mt-1 text-xl">{chapter.title}</p>
          <p className="mt-4 text-px-muted">{chapter.ilos[0]?.statement ?? chapter.summary}</p>
          <div className="mt-4 h-4 bg-px-night" aria-label={`Alex learning progress ${Math.round(progress * 100)}%`}><div className="h-full bg-px-violet" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          <p className="mt-2 font-pixel text-[0.55rem] text-px-muted">BRAIN SYNC {Math.round(progress * 100)}%</p>
        </PixelPanel>

        <div className="space-y-3">
          <h2 className="font-pixel text-[0.65rem] text-px-cream">KNOWLEDGE CARDS</h2>
          {Object.values(brain.concepts).map((concept) => (
            <PixelPanel key={concept.conceptId} className={state.repairTarget === concept.conceptId ? "[--px-b:var(--px-gold)]" : "[--px-b:var(--px-wall-line)]"}>
              <details open={openCards || undefined} data-testid={`card-${concept.conceptId}`}>
                <summary className="cursor-pointer list-none">
                  <div className="flex items-start justify-between gap-2"><p className="font-pixel text-[0.58rem] leading-relaxed">{concept.label}</p><span className="text-px-muted">{concept.level}/3</span></div>
                  <div className="mt-3"><LevelPips level={concept.level} /></div>
                  {concept.misconceptions.length > 0 && <p className="mt-3 text-px-red">⚠ {concept.misconceptions.at(-1)}</p>}
                </summary>
                <div className="mt-3 space-y-2 text-lg">
                  <p className="font-pixel text-[0.5rem] text-px-muted">{LEVELS[concept.level].toUpperCase()}</p>
                  {concept.evidence.length > 0 ? (
                    <div><p className="font-pixel text-[0.5rem] text-px-mint">YOUR WORDS</p>{concept.evidence.slice(-3).map((quote) => <p key={quote} className="border-l-4 border-px-mint pl-2">“{quote}”</p>)}</div>
                  ) : <p className="text-px-muted">No teaching evidence yet.</p>}
                  {concept.misconceptions.length > 0 && <div><p className="font-pixel text-[0.5rem] text-px-red">MISCONCEPTIONS</p>{concept.misconceptions.map((m) => <p key={m}>• {m}</p>)}</div>}
                  {concept.missingPoints.length > 0 && <div><p className="font-pixel text-[0.5rem] text-px-gold">STILL MISSING</p>{concept.missingPoints.map((m) => <p key={m}>• {m}</p>)}</div>}
                </div>
              </details>
            </PixelPanel>
          ))}
        </div>
      </aside>

      <main className="space-y-5">
        <ChapterRail game={game} state={state} mode="teaching" currentWeek={chapter.week} onSelect={chooseChapter} />
        {state.repairTarget && <PixelPanel tone="danger"><p className="font-pixel text-[0.65rem]">REPAIR MISSION</p><p className="mt-2">Give Alex new evidence for {brain.concepts[state.repairTarget]?.label}. Opening this room did not increase mastery.</p></PixelPanel>}
        {status && !status.claude && <PixelPanel tone="danger"><p className="font-pixel text-[0.6rem]">OFFLINE DEMO</p><p className="mt-2">No Claude API key found, so Alex uses a simple keyword evaluator. Add ANTHROPIC_API_KEY to apps/web/.env.local and restart.</p></PixelPanel>}
        {notice && <p className="text-px-gold" role="status">{notice}</p>}

        {!chapterState.teachingUnlocked ? (
          <PixelPanel tone="danger"><p className="font-pixel text-[0.65rem]">🔒 CHAPTER LOCKED</p><p className="mt-2">Pass the previous chapter&apos;s assessment to unlock Week {chapter.week}.</p></PixelPanel>
        ) : (
          <>
            {/* Room scene: click a zone and Alex walks there (CSS transition only). */}
            <div className="relative h-72 overflow-hidden border-4 border-px-ink bg-px-wall" data-testid="teaching-scene">
              <div className="absolute inset-x-0 bottom-0 h-16 bg-px-wood-dark" />
              <div className="absolute inset-x-0 bottom-16 h-1 bg-px-wood" />
              {ZONES.map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => setSelectedZone(zone.id)}
                  aria-pressed={selectedZone === zone.id}
                  aria-label={`${zone.label}: ${zone.hint}`}
                  className={`group absolute ${zone.box} outline-none`}
                >
                  {zone.art}
                  <span className={`absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap font-pixel text-[0.5rem] ${selectedZone === zone.id ? "text-px-gold" : "text-px-muted group-hover:text-px-cream group-focus-visible:text-px-cream"}`}>
                    {selectedZone === zone.id ? "▼ " : ""}{zone.label.toUpperCase()}
                  </span>
                  <span className={`pointer-events-none absolute inset-0 border-4 ${selectedZone === zone.id ? "border-px-gold" : "border-transparent group-hover:border-px-violet group-focus-visible:border-px-violet"}`} />
                </button>
              ))}
              <div
                className="pointer-events-none absolute bottom-6 z-10 w-16 -translate-x-1/2 transition-[left] duration-700 ease-in-out"
                style={{ left: ZONES.find((z) => z.id === selectedZone)?.alexLeft }}
                data-testid="alex-position"
                data-zone={selectedZone}
              >
                <AlexSprite mood={reaction} className="w-16" label={`Alex looks ${reaction.replace("_", " ")}`} />
              </div>
            </div>

            <div className="grid items-end gap-5 sm:grid-cols-[9rem_1fr]">
              <div className="text-center">
                <p className="font-pixel text-[0.65rem] text-px-violet">ALEX</p>
                <p className="text-px-muted" data-testid="alex-reaction">{reaction === "got_it" ? "got it!" : reaction}</p>
              </div>
              <SpeechBubble>{pending ? "Hmm, let me think…" : lastAlex?.text ?? "I am listening. Teach me one cause-and-effect idea at a time."}</SpeechBubble>
            </div>

            {/* One floating panel; content switches with the selected zone. */}
            <div data-testid="zone-panel"><PixelPanel className="relative z-10 shadow-[8px_8px_0_var(--px-night)] [--px-b:var(--px-gold)]">
              <p className="font-pixel text-[0.6rem] text-px-gold">{ZONES.find((z) => z.id === selectedZone)?.title}</p>
              <div className="mt-4 space-y-4">
                {selectedZone === "blackboard" && (
                  <Whiteboard disabled={!!pending} onSubmit={(image) => teach({ text: image.note, modality: "image", image })} />
                )}

                {selectedZone === "desk" && (
                  <>
                    <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Alex actions">
                      <PixelButton variant="ghost" disabled={!!pending} onClick={() => runAction("challenge")}>Challenge me</PixelButton>
                      <PixelButton variant="ghost" disabled={!!pending} onClick={() => runAction("teach_back")}>Alex teach-back</PixelButton>
                      <PixelButton variant="ghost" disabled={!!pending} onClick={() => runAction("give_example")}>Give an example</PixelButton>
                      <PixelButton variant="ghost" disabled={!!pending} onClick={() => runAction("check_memory")}>Check memory</PixelButton>
                    </div>
                    <div className="max-h-[22rem] space-y-4 overflow-y-auto bg-px-night/40 p-3">
                      {messages.map((message) => (
                        <div key={message.id} className={`flex ${message.role === "student" ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[85%] p-3 ${message.role === "student" ? "bg-[#493b70]" : "bg-px-night"}`}>
                            <p className="font-pixel text-[0.5rem] text-px-muted">
                              {message.role === "student" ? `MENTOR${message.modality === "voice" ? " · VOICE" : ""}` : "ALEX"}
                              {message.strategy && <span className="ml-2 text-px-violet">· {STRATEGY_LABEL[message.strategy] ?? message.strategy}</span>}
                            </p>
                            <p className="mt-1 text-xl">{message.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {offerTeachBackReplies && (
                      <div className="flex flex-wrap gap-2" aria-label="Respond to Alex's teach-back">
                        <PixelButton onClick={() => teach({ text: "Yes, that's right.", modality: "text" })}>That&apos;s right</PixelButton>
                        <PixelButton variant="ghost" onClick={() => { setDraft("Not quite: "); input.current?.focus(); }}>Correct Alex</PixelButton>
                        <PixelButton variant="ghost" onClick={() => runAction("give_example")}>Another example</PixelButton>
                      </div>
                    )}
                    <form onSubmit={submit} className="space-y-3">
                      <label htmlFor="purple-teaching-input" className="font-pixel text-[0.6rem] text-px-violet">YOUR EXPLANATION</label>
                      <textarea id="purple-teaching-input" ref={input} value={draft} onChange={(event) => { setDraft(event.target.value); setDraftIsTranscript(false); }} className="px-input px-frame min-h-28 resize-y" placeholder="Explain why it works, not only what it is..." />
                      <PixelButton type="submit" disabled={!draft.trim() || !!pending}>{pending === "turn" ? "Alex is thinking…" : "Teach Alex"}</PixelButton>
                    </form>
                  </>
                )}

                {selectedZone === "sofa" && (
                  <>
                    <div className="flex flex-wrap gap-3">
                      <PixelButton disabled={(!status?.transcription && !recording) || (!!pending && !recording)} onClick={toggleRecording} title={status?.transcription ? undefined : "Add ELEVENLABS_API_KEY to enable voice"}>
                        {recording ? "⏹ Stop recording" : pending === "transcribe" ? "Transcribing…" : "🎙 Record explanation"}
                      </PixelButton>
                      {status?.speech && <PixelButton variant="ghost" onClick={toggleMute} aria-pressed={muted}>{muted ? "🔇 Alex's voice off" : "🔊 Alex's voice on"}</PixelButton>}
                    </div>
                    {!status?.transcription && <p className="text-px-muted">Voice needs ELEVENLABS_API_KEY. You can still type below.</p>}
                    <form onSubmit={submit} className="space-y-3">
                      <label htmlFor="purple-voice-transcript" className="font-pixel text-[0.6rem] text-px-violet">REVIEW YOUR TRANSCRIPT</label>
                      <textarea id="purple-voice-transcript" ref={input} value={draft} onChange={(event) => setDraft(event.target.value)} className="px-input px-frame min-h-24 resize-y" placeholder="Record, then fix any mistakes before sending…" />
                      <PixelButton type="submit" disabled={!draft.trim() || !!pending}>{pending === "turn" ? "Alex is thinking…" : "Send to Alex"}</PixelButton>
                    </form>
                    {lastAlex && (
                      <div className="bg-px-night p-3">
                        <p className="font-pixel text-[0.5rem] text-px-muted">ALEX&apos;S LAST REPLY</p>
                        <p className="mt-1 text-xl">{lastAlex.text}</p>
                        {status?.speech && lastAlex.strategy && !lastAlex.id.startsWith("alex-local") && (
                          <PixelButton variant="ghost" className="mt-2" onClick={() => speak(lastAlex.text, lastAlex.id.slice(5), true)}>▶ Play Alex&apos;s reply</PixelButton>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </PixelPanel></div>
            {error && <p className="text-px-red" role="alert">{error}</p>}

            <div className="flex flex-wrap items-center justify-end gap-3">
              {unlockedMessage && <p className="text-px-mint" role="status">{unlockedMessage}</p>}
              {chapterState.teachingCompleted ? (
                <PixelButton size="lg" onClick={() => router.push(`/games/${game.id}/assessment-room`)}>Go to Assessment → Week {chapter.week}</PixelButton>
              ) : (
                <PixelButton size="lg" onClick={finishTeachingChapter}>Finish Teaching Chapter</PixelButton>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
