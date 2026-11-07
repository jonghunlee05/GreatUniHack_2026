"use client";

import type { Game } from "@/lib/game-schema";
import { chapterKey, type PurpleState } from "./types";

/** Assessment score needed to pass a chapter and unlock the next teaching chapter. */
export const PASS_SCORE = 65;

export type ChapterProgress = {
  teachingUnlocked: boolean;
  teachingCompleted: boolean;
  assessmentUnlocked: boolean;
  assessmentCompleted: boolean;
};

/** Only the two completions are stored; unlocks are derived so they can never disagree. */
export function chapterProgress(game: Game, state: PurpleState): Record<number, ChapterProgress> {
  const done = state.progress ?? {};
  const result: Record<number, ChapterProgress> = {};
  game.chapters.forEach((chapter, index) => {
    const mine = done[chapterKey(chapter.week)] ?? {};
    const previous = index > 0 ? done[chapterKey(game.chapters[index - 1].week)] : undefined;
    const teachingUnlocked = index === 0 || Boolean(previous?.assessmentCompleted);
    const teachingCompleted = teachingUnlocked && Boolean(mine.teachingCompleted);
    result[chapter.week] = {
      teachingUnlocked,
      teachingCompleted,
      assessmentUnlocked: teachingCompleted,
      assessmentCompleted: teachingCompleted && Boolean(mine.assessmentCompleted),
    };
  });
  return result;
}

export function markProgress(state: PurpleState, week: number, field: "teachingCompleted" | "assessmentCompleted"): PurpleState {
  const key = chapterKey(week);
  const progress = state.progress ?? {};
  return { ...state, progress: { ...progress, [key]: { ...progress[key], [field]: true } } };
}

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
        const border = current ? "border-px-gold" : completed ? "border-px-mint" : unlocked ? "border-px-violet" : "border-px-wall-line";
        return (
          <button
            key={chapter.week}
            type="button"
            disabled={!unlocked}
            aria-current={current ? "true" : undefined}
            onClick={() => onSelect(chapter.week)}
            title={unlocked ? chapter.title : mode === "teaching" ? "Pass the previous chapter's assessment to unlock" : "Finish this chapter's teaching to unlock"}
            className={`min-w-[10.5rem] shrink-0 border-4 ${border} bg-px-night p-3 text-left transition-transform ${unlocked ? "hover:-translate-y-1" : "cursor-not-allowed opacity-50"}`}
          >
            <p className="font-pixel text-[0.55rem] text-px-muted">WEEK {chapter.week}</p>
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
