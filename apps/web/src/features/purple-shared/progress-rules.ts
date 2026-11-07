import type { Game } from "@/lib/game-schema";
import type { PurpleState } from "./types";

/**
 * Chapter progression rules (pure, no React, so they can be unit-tested with node --test):
 * Teaching N done → Assessment N unlocks; Assessment N passed → Teaching N+1 unlocks.
 */

const weekKey = (week: number) => String(week); // same as chapterKey in types.ts

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
    const mine = done[weekKey(chapter.week)] ?? {};
    // Use the previous chapter's *derived* state, so stored flags can't skip a step.
    const previous = index > 0 ? result[game.chapters[index - 1].week] : undefined;
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
  const key = weekKey(week);
  const progress = state.progress ?? {};
  return { ...state, progress: { ...progress, [key]: { ...progress[key], [field]: true } } };
}

