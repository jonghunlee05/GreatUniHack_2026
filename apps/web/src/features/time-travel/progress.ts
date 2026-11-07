import "server-only";
import type { Game } from "@/lib/game-schema";
import type { ChapterPack, Era, Experiment, FieldNote, KeyEvent, MentorChat } from "@/lib/chapter-pack";
import {
  getPack,
  getPackInput,
  getPlayState,
  setChapterState,
  unlockNextChapter,
  updatePlayState,
  type PlayState,
  type TimeTravelProgress,
} from "@/lib/play-state";
import { EXAMINER_MOCK, examine, type ExaminerVerdict } from "./examiner";

export class ProgressError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}

/** What the browser gets: the era without the mentor answers (key points, hints, correct option). */
export type ClientEra = Omit<Era, "mentor_question" | "field_notes" | "mentor_chat" | "experiment"> & {
  mentor: { asked_by: string; question: string; scene: number };
};
export type ClientSource = { file: string; page: number | null };

export type EraView = {
  era: ClientEra;
  sources: Record<string, ClientSource>;
  events: KeyEvent[];
  progress: TimeTravelProgress;
  hints: string[];
  mcqOptions: string[] | null;
  /** Optional extras (may be absent on older packs). The experiment is practice, not graded. */
  mentorChat: MentorChat | null;
  experiment: Experiment | null;
  /** How many of the mentor question's key ideas the last answer covered. */
  keyPointCount: number;
  fieldNotes: FieldNote[] | null;
};

export function newProgress(): TimeTravelProgress {
  return {
    scene: 1,
    collectedClueIds: [],
    mentor: { attempts: 0, hintsShown: 0, passed: false, usedFallback: false, highlightedClueId: null, wrong: 0 },
    experimentDone: false,
    ripple: null,
    finished: false,
  };
}

/** Fills fields added after a progress record was first saved. */
function normalize(p: TimeTravelProgress): TimeTravelProgress {
  p.mentor.wrong ??= 0;
  p.experimentDone ??= false;
  p.ripple ??= null;
  return p;
}

const PLAYABLE = new Set(["ready", "in_progress", "completed"]);

export async function loadPackOrThrow(game: Game, chapterId: string): Promise<ChapterPack> {
  const pack = await getPack(game.id, chapterId);
  if (!pack) throw new ProgressError("This chapter hasn't been generated yet.", 404);
  return pack;
}

function requirePlayable(state: PlayState, chapterId: string): TimeTravelProgress {
  const status = state.chapters[chapterId];
  if (!status || !PLAYABLE.has(status.state)) throw new ProgressError("This era isn't open yet.", 409);
  return normalize((state.timeTravel[chapterId] ??= newProgress()));
}

export async function buildEraView(game: Game, chapterId: string, state: PlayState): Promise<EraView> {
  const pack = await loadPackOrThrow(game, chapterId);
  const input = await getPackInput(game.id, chapterId);
  const progress = normalize(state.timeTravel[chapterId] ?? newProgress());
  const { mentor_question: mq, field_notes, mentor_chat, experiment, ...rest } = pack.era;

  return {
    era: { ...rest, mentor: { asked_by: mq.asked_by, question: mq.question, scene: mq.scene } },
    sources: Object.fromEntries((input?.chapter.sources ?? []).map((s) => [s.id, { file: s.file, page: s.page }])),
    events: input?.chapter.key_events ?? [],
    progress,
    hints: mq.hints.slice(0, progress.mentor.hintsShown),
    mcqOptions: progress.mentor.usedFallback ? mq.mcq_fallback.options : null,
    mentorChat: mentor_chat ?? null,
    experiment: experiment ?? null,
    keyPointCount: mq.key_points.length,
    fieldNotes: progress.finished ? field_notes : null,
  };
}

export type ProgressAction =
  | { type: "start" }
  | { type: "advance"; scene: number }
  | { type: "collect"; clueId: string }
  | { type: "experiment" }
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
        if (action.scene !== p.scene + 1 || action.scene > 4) throw new ProgressError("You can only move to the next scene.");
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

      case "experiment": {
        const exp = pack.era.experiment;
        if (!exp) throw new ProgressError("This era has no experiment.", 404);
        if (exp.scene > p.scene) throw new ProgressError("You haven't reached the experiment yet.");
        p.experimentDone = true;
        break;
      }

      case "finish": {
        if (p.scene !== 4 || !p.mentor.passed) throw new ProgressError("Reach today's rule before finishing the era.");
        if (!p.finished) {
          p.finished = true;
          // "Change the future": a shaky mentor answer leaves a time ripple on this chapter.
          p.ripple = p.mentor.wrong >= 2;
          s.fieldNotes[chapterId] = pack.era.field_notes;
          s.teachingUnlocked[chapterId] = true;
          if (process.env.UNLOCK_NEXT_ON !== "assessment") unlockNextChapter(game, s, chapterId);
          const mentorScene = pack.era.scenes.find((sc) => sc.n === pack.era.mentor_question.scene);
          (s.ripples ??= {})[chapterId] = p.ripple ? (mentorScene?.concept_ids ?? []) : [];
        }
        break;
      }
    }
    return s;
  });

  return buildEraView(game, chapterId, state);
}

export type MentorVerdict = "correct" | "partly" | "not_yet" | "choose";

/**
 * Scene 3 mentor question.
 *  1. Free text → the examiner (cheap model). Wrong answers reveal the next hint.
 *  2. After the hints run out, the relevant clue is highlighted for one more try.
 *  3. Then (or if the examiner is mocked or fails) the multiple-choice fallback.
 */
export async function answerMentor(
  game: Game,
  chapterId: string,
  body: { answer?: string; mcqIndex?: number },
  examiner: typeof examine = examine, // swappable for tests
): Promise<EraView & { verdict: MentorVerdict; feedback: string; covered?: number }> {
  const pack = await loadPackOrThrow(game, chapterId);
  const mq = pack.era.mentor_question;

  // Validate before spending a call.
  const current = requirePlayable(await getPlayState(game), chapterId);
  if (current.scene !== mq.scene) throw new ProgressError("The mentor asks this question in scene 3.");

  // Run the examiner outside the state lock (it's a network call).
  let exam: ExaminerVerdict | "fallback" | null = null;
  if (body.mcqIndex === undefined && !current.mentor.passed && !current.mentor.usedFallback) {
    if (EXAMINER_MOCK()) {
      exam = "fallback";
    } else {
      try {
        exam = await examiner(mq.question, mq.key_points, body.answer ?? "", { gameId: game.id, chapterId });
      } catch (error) {
        console.error("Examiner failed, using multiple choice", error);
        exam = "fallback";
      }
    }
  }

  let verdict: MentorVerdict = "choose";
  let feedback = "";
  let covered: number | undefined;

  const state = await updatePlayState(game, (s) => {
    const p = requirePlayable(s, chapterId);
    if (p.mentor.passed) {
      verdict = "correct";
      return s;
    }
    p.mentor.attempts += 1;

    // Multiple-choice answer
    if (typeof body.mcqIndex === "number") {
      if (!p.mentor.usedFallback) throw new ProgressError("Answer in your own words first.");
      verdict = body.mcqIndex === mq.mcq_fallback.correct_index ? "correct" : "not_yet";
      if (verdict === "correct") p.mentor.passed = true;
      else {
        p.mentor.wrong += 1;
        feedback = "Not yet. Look at your clues and try another option.";
      }
      return s;
    }

    if (p.mentor.usedFallback) throw new ProgressError("Pick one of the options.");

    if (exam === "fallback" || exam === null) {
      p.mentor.usedFallback = true;
      verdict = "choose";
      feedback = EXAMINER_MOCK()
        ? "Let's narrow it down. Choose the best answer."
        : "The examiner is unavailable right now, so choose the best answer instead.";
      return s;
    }

    covered = mq.key_points.length - exam.missing.length;
    if (exam.verdict === "correct") {
      verdict = "correct";
      p.mentor.passed = true;
      return s;
    }

    verdict = exam.verdict;
    p.mentor.wrong += 1;
    const progressNote = `You've covered ${covered} of ${mq.key_points.length} key ideas.`;

    if (p.mentor.hintsShown < mq.hints.length) {
      p.mentor.hintsShown += 1;
      feedback = `${progressNote} ${exam.feedback} A new hint is below.`;
    } else if (!p.mentor.highlightedClueId) {
      p.mentor.highlightedClueId = relevantClue(pack);
      // Make sure the highlighted clue is in the logbook, even if it hadn't been found yet.
      const hl = p.mentor.highlightedClueId;
      if (hl && !p.collectedClueIds.includes(hl)) p.collectedClueIds.push(hl);
      feedback = `${progressNote} ${exam.feedback} Look at the highlighted clue in your logbook, then try once more.`;
    } else {
      p.mentor.usedFallback = true;
      verdict = "choose";
      feedback = `${progressNote} Let's narrow it down. Choose the best answer.`;
    }
    return s;
  });

  return { ...(await buildEraView(game, chapterId, state)), verdict, feedback, covered };
}

/** The clue most related to the mentor question: shares a concept with scene 3, from scenes 1–3. */
function relevantClue(pack: ChapterPack): string | null {
  const era = pack.era;
  const mentorScene = era.scenes.find((s) => s.n === era.mentor_question.scene);
  const concepts = new Set(mentorScene?.concept_ids ?? []);
  const candidates = era.scenes
    .filter((s) => s.n <= era.mentor_question.scene)
    .flatMap((s) => s.clue_ids)
    .map((id) => era.clues.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  return (candidates.find((c) => c.concept_ids.some((id) => concepts.has(id))) ?? candidates[0])?.id ?? null;
}
