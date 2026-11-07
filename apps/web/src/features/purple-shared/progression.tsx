"use client";

import type { Game } from "@/lib/game-schema";
import type { PurpleState } from "./types";
import { chapterProgress } from "./progress-rules";

export { PASS_SCORE, chapterProgress, markProgress, type ChapterProgress } from "./progress-rules";

/** Level-select rail of chapter cards: Locked / Unlocked / Completed. */
export function ChapterRail({
  game, state, mode, currentWeek, onSelect,
}: {
  game: Game;
  state: PurpleState;
  mode: "teaching" | "assessment";
  currentWeek: number;
  onSelect: (week: number) => void;
}) {
  const progress = chapterProgress(game, state);
  return (
    <nav aria-label={`${mode} chapters`} className="flex gap-3 overflow-x-auto pb-2">
      {game.chapters.map((chapter) => {
        const p = progress[chapter.week];
        const unlocked = mode === "teaching" ? p.teachingUnlocked : p.assessmentUnlocked;
        const completed = mode === "teaching" ? p.teachingCompleted : p.assessmentCompleted;
        const status = completed ? "COMPLETED" : unlocked ? "UNLOCKED" : "LOCKED";
        const current = chapter.week === currentWeek;
        const frame = current ? "[--px-b:var(--px-gold)]" : completed ? "[--px-b:var(--px-mint)]" : unlocked ? "[--px-b:var(--px-violet)]" : "[--px-b:var(--px-wall-line)]";
        return (
          <button
            key={chapter.week}
            type="button"
            disabled={!unlocked}
            aria-current={current ? "true" : undefined}
            onClick={() => onSelect(chapter.week)}
            title={unlocked ? chapter.title : mode === "teaching" ? "Pass the previous chapter's assessment to unlock" : "Finish this chapter's teaching to unlock"}
            className={`px-frame min-w-[11rem] shrink-0 p-4 text-left transition-transform ${frame} ${unlocked ? "bg-px-ink hover:-translate-y-1" : "cursor-not-allowed bg-px-night text-px-muted"}`}
          >
            <p className="font-pixel text-[0.55rem] text-px-gold">{mode === "teaching" ? "TEACH" : "MISSION"} · WEEK {chapter.week}</p>
            <p className="mt-2 line-clamp-2 text-lg leading-tight">{unlocked ? chapter.title : "???"}</p>
            <p className={`mt-2 font-pixel text-[0.5rem] ${completed ? "text-px-mint" : unlocked ? "text-px-violet" : "text-px-muted"}`}>
              {completed ? "★ " : unlocked ? "▶ " : "🔒 "}{status}
            </p>
          </button>
        );
      })}
    </nav>
  );
}
