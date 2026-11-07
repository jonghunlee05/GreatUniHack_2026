"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Game } from "@/lib/game-schema";
import { AlexSprite } from "@/components/pixel/AlexSprite";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelPanel, SpeechBubble } from "@/components/pixel/PixelPanel";
import { evaluateTeaching } from "@/features/purple-shared/engine";
import { chapterKey, type KnowledgeLevel, type TeachingMessage } from "@/features/purple-shared/types";
import { usePurpleState } from "@/features/purple-shared/state";

const LEVELS = ["Not learned", "Recognised", "Understood", "Applied"];

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
  const [showTeachBack, setShowTeachBack] = useState(false);
  const chapter = useMemo(() => game.chapters.find((item) => item.week === state.currentChapterWeek) ?? game.chapters[0], [game.chapters, state.currentChapterWeek]);
  const key = chapterKey(chapter.week);
  const brain = state.brains[key];
  const messages = state.conversations[key] ?? [];
  const progress = Object.values(brain.concepts).reduce((sum, item) => sum + item.level, 0) / Math.max(1, Object.keys(brain.concepts).length * 3);

  function chooseChapter(week: number) {
    update((current) => ({ ...current, currentChapterWeek: week, repairTarget: null }));
    setShowTeachBack(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const { nextBrain, evaluation } = evaluateTeaching(chapter, brain, text);
    const turn = nextBrain.turn;
    const nextMessages: TeachingMessage[] = [
      ...messages,
      { id: `student-${chapter.week}-${turn}`, role: "student", text },
      { id: `alex-${chapter.week}-${turn}`, role: "alex", text: evaluation.nextQuestion },
    ];
    update((current) => ({ ...current, repairTarget: null, brains: { ...current.brains, [key]: nextBrain }, conversations: { ...current.conversations, [key]: nextMessages } }));
    setDraft("");
  }

  if (!ready) return <PixelPanel><p>Loading Alex&apos;s memory...</p></PixelPanel>;

  return (
    <div className="grid gap-6 lg:grid-cols-[19rem_1fr]">
      <aside className="space-y-5">
        <PixelPanel className="[--px-b:var(--px-violet)]">
          <p className="font-pixel text-[0.6rem] text-px-violet">TEACHING ROOM</p>
          <label className="mt-4 block text-px-muted" htmlFor="purple-chapter">Current chapter</label>
          <select id="purple-chapter" value={chapter.week} onChange={(event) => chooseChapter(Number(event.target.value))} className="px-input px-frame mt-2">
            {game.chapters.map((item) => <option key={item.week} value={item.week}>Week {item.week}: {item.title}</option>)}
          </select>
          <p className="mt-4 text-px-muted">{chapter.ilos[0]?.statement ?? chapter.summary}</p>
          <div className="mt-4 h-4 bg-px-night" aria-label={`Alex learning progress ${Math.round(progress * 100)}%`}><div className="h-full bg-px-violet" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          <p className="mt-2 font-pixel text-[0.55rem] text-px-muted">BRAIN SYNC {Math.round(progress * 100)}%</p>
        </PixelPanel>

        <div className="space-y-3">
          <h2 className="font-pixel text-[0.65rem] text-px-cream">KNOWLEDGE CARDS</h2>
          {Object.values(brain.concepts).map((concept) => (
            <PixelPanel key={concept.conceptId} className={state.repairTarget === concept.conceptId ? "[--px-b:var(--px-gold)]" : "[--px-b:var(--px-wall-line)]"}>
              <div className="flex items-start justify-between gap-2"><p className="font-pixel text-[0.58rem] leading-relaxed">{concept.label}</p><span className="text-px-muted">{concept.level}/3</span></div>
              <div className="mt-3"><LevelPips level={concept.level} /></div>
              {concept.misconceptions.length > 0 && <p className="mt-3 text-px-red">⚠ {concept.misconceptions.at(-1)}</p>}
            </PixelPanel>
          ))}
        </div>
      </aside>

      <main className="space-y-5">
        {state.repairTarget && <PixelPanel tone="danger"><p className="font-pixel text-[0.65rem]">REPAIR MISSION</p><p className="mt-2">Give Alex new evidence for {brain.concepts[state.repairTarget]?.label}. Opening this room did not increase mastery.</p></PixelPanel>}
        <div className="grid items-end gap-5 sm:grid-cols-[9rem_1fr]">
          <div className="text-center"><AlexSprite mood={brain.turn ? "reading" : "idle"} className="mx-auto w-28" label="Alex, the AI apprentice" /><p className="font-pixel text-[0.65rem] text-px-violet">ALEX</p><p className="text-px-muted">curious apprentice</p></div>
          <SpeechBubble>{messages.at(-1)?.role === "alex" ? messages.at(-1)?.text : "I am listening. Teach me one cause-and-effect idea at a time."}</SpeechBubble>
        </div>

        <PixelPanel className="max-h-[29rem] space-y-4 overflow-y-auto [--px-b:var(--px-violet)]">
          {messages.map((message) => <div key={message.id} className={`flex ${message.role === "student" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] p-3 ${message.role === "student" ? "bg-[#493b70]" : "bg-px-night"}`}><p className="font-pixel text-[0.5rem] text-px-muted">{message.role === "student" ? "MENTOR" : "ALEX"}</p><p className="mt-1 text-xl">{message.text}</p></div></div>)}
        </PixelPanel>

        <form onSubmit={submit} className="space-y-3">
          <label htmlFor="purple-teaching-input" className="font-pixel text-[0.6rem] text-px-violet">YOUR EXPLANATION</label>
          <textarea id="purple-teaching-input" value={draft} onChange={(event) => setDraft(event.target.value)} className="px-input px-frame min-h-28 resize-y" placeholder="Explain why it works, not only what it is..." />
          <div className="flex flex-wrap gap-3"><PixelButton type="submit" disabled={!draft.trim()}>Teach Alex</PixelButton><PixelButton variant="ghost" onClick={() => setShowTeachBack((value) => !value)}>Alex teach-back</PixelButton></div>
        </form>

        {showTeachBack && <PixelPanel tone="cream"><p className="font-pixel text-[0.65rem]">WHAT ALEX BELIEVES</p><ul className="mt-4 space-y-3">{Object.values(brain.concepts).map((concept) => <li key={concept.conceptId}><strong>{concept.label}:</strong> {concept.level === 0 ? "I have not been taught this yet." : concept.misconceptions.at(-1) ?? `You told me: “${concept.evidence.at(-1)}”`}</li>)}</ul></PixelPanel>}
        <div className="flex justify-end"><PixelButton size="lg" onClick={() => router.push(`/games/${game.id}/assessment-room`)}>Finish teaching → Mission Control</PixelButton></div>
      </main>
    </div>
  );
}
