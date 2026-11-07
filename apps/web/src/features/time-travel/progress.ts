import "server-only";
import type { Game } from "@/lib/game-schema";
import type { ChapterPack, Era, FieldNote, KeyEvent } from "@/lib/chapter-pack";
import {
  getPack,
  getPackInput,
  setChapterState,
  updatePlayState,
  type PlayState,
  type TimeTravelProgress,
} from "@/lib/play-state";

export class ProgressError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}

/** What the browser gets: the era without any answers (key points, hints, correct option). */
export type ClientEra = Omit<Era, "mentor_question" | "field_notes"> & {
  mentor: { asked_by: string; question: string };
};
export type ClientSource = { file: string; page: number | null };

export type EraView = {
  era: ClientEra;
  sources: Record<string, ClientSource>;
  /** The real key events this era was built from. */
  events: KeyEvent[];
  progress: TimeTravelProgress;
  /** Hints the server has revealed so far. */
  hints: string[];
  /** Multiple-choice options, once the fallback is in use. */
  mcqOptions: string[] | null;
  /** Field notes, only once the era is finished. */
  fieldNotes: FieldNote[] | null;
};

export function newProgress(): TimeTravelProgress {
  return {
    scene: 1,
    collectedClueIds: [],
    mentor: { attempts: 0, hintsShown: 0, passed: false, usedFallback: false, highlightedClueId: null },
    finished: false,
  };
}

const PLAYABLE = new Set(["ready", "in_progress", "completed"]);

export async function loadPackOrThrow(game: Game, chapterId: string): Promise<ChapterPack> {
  const pack = await getPack(game.id, chapterId);
  if (!pack) throw new ProgressError("This chapter hasn't been generated yet.", 404);
  return pack;
}

function requirePlayable(state: PlayState, chapterId: string): TimeTravelProgress {
  const status = state.chapters[chapterId];
  if (!status || !PLAYABLE.has(status.state)) {
    throw new ProgressError("This era isn't open yet.", 409);
  }
  return (state.timeTravel[chapterId] ??= newProgress());
}

export async function buildEraView(game: Game, chapterId: string, state: PlayState): Promise<EraView> {
  const pack = await loadPackOrThrow(game, chapterId);
  const input = await getPackInput(game.id, chapterId);
  const progress = state.timeTravel[chapterId] ?? newProgress();
  const { mentor_question: mq, field_notes, ...rest } = pack.era;

  return {
    era: { ...rest, mentor: { asked_by: mq.asked_by, question: mq.question } },
    sources: Object.fromEntries(
      (input?.chapter.sources ?? []).map((s) => [s.id, { file: s.file, page: s.page }]),
    ),
    events: input?.chapter.key_events ?? [],
    progress,
    hints: mq.hints.slice(0, progress.mentor.hintsShown),
    mcqOptions: progress.mentor.usedFallback ? mq.mcq_fallback.options : null,
    fieldNotes: progress.finished ? field_notes : null,
  };
}

export type ProgressAction =
  | { type: "start" }
  | { type: "advance"; scene: number }
  | { type: "collect"; clueId: string }
  | { type: "finish" };

/** Applies one player action. All unlock / order rules are enforced here. */
export async function applyAction(game: Game, chapterId: string, action: ProgressAction): Promise<EraView> {
  const pack = await loadPackOrThrow(game, chapterId);

  const state = await updatePlayState(game, (s) => {
    const p = requirePlayable(s, chapterId);

    switch (action.type) {
      case "start":
        if (s.chapters[chapterId].state === "ready") setChapterState(s, chapterId, "in_progress");
        break;

      case "advance":
        if (action.scene !== p.scene + 1 || action.scene > 4) {
          throw new ProgressError("You can only move to the next scene.");
        }
        if (p.scene === pack.era.mentor_question.scene && !p.mentor.passed) {
          throw new ProgressError("Answer the mentor's question before moving on.");
        }
        p.scene = action.scene;
        break;

      case "collect": {
        const clue = pack.era.clues.find((c) => c.id === action.clueId);
        const scene = pack.era.scenes.find((sc) => sc.clue_ids.includes(action.clueId));
        if (!clue || !scene) throw new ProgressError("Unknown clue.", 404);
        if (scene.n > p.scene) throw new ProgressError("You haven't reached that scene yet.");
        if (!p.collectedClueIds.includes(clue.id)) p.collectedClueIds.push(clue.id);
        break;
      }

      case "finish":
        if (p.scene !== 4 || !p.mentor.passed) {
          throw new ProgressError("Reach today's rule before finishing the era.");
        }
        p.finished = true;
        s.fieldNotes[chapterId] = pack.era.field_notes;
        s.teachingUnlocked[chapterId] = true;
        break;
    }
    return s;
  });

  return buildEraView(game, chapterId, state);
}

/**
 * Scene 3 mentor question, multiple-choice path (EXAMINER_MOCK / fallback).
 * Stage 4 adds the free-text examiner in front of this.
 */
export async function answerMentor(
  game: Game,
  chapterId: string,
  body: { answer?: string; mcqIndex?: number },
): Promise<EraView & { verdict: "correct" | "not_yet" | "choose" }> {
  const pack = await loadPackOrThrow(game, chapterId);
  const mq = pack.era.mentor_question;
  let verdict: "correct" | "not_yet" | "choose" = "choose";

  const state = await updatePlayState(game, (s) => {
    const p = requirePlayable(s, chapterId);
    if (p.scene !== mq.scene) throw new ProgressError("The mentor asks this question in scene 3.");
    if (p.mentor.passed) {
      verdict = "correct";
      return s;
    }
    p.mentor.attempts += 1;

    if (typeof body.mcqIndex === "number") {
      if (!p.mentor.usedFallback) throw new ProgressError("Answer in your own words first.");
      verdict = body.mcqIndex === mq.mcq_fallback.correct_index ? "correct" : "not_yet";
      if (verdict === "correct") p.mentor.passed = true;
    } else {
      // No examiner yet: switch to the multiple-choice fallback.
      p.mentor.usedFallback = true;
      verdict = "choose";
    }
    return s;
  });

  return { ...(await buildEraView(game, chapterId, state)), verdict };
}
