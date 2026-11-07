import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { Game } from "./game-schema";
import {
  ChapterPackSchema,
  chapterIdFor,
  type ChapterPack,
  type FieldNote,
  type KnowledgeDebt,
} from "./chapter-pack";

/**
 * Per-game play state and chapter packs, stored as JSON next to the games:
 *   data/play/<gameId>.json            chapter states, progress, field notes
 *   data/packs/<gameId>/<chapterId>.json   Agent 2 output (written once)
 * Single player for now: no user ids.
 */

export const CHAPTER_STATES = [
  "locked",
  "available",
  "generating",
  "ready",
  "in_progress",
  "completed",
  "failed",
] as const;
export type ChapterState = (typeof CHAPTER_STATES)[number];

export type ChapterStatus = {
  state: ChapterState;
  /** Readable reason when state is "failed". */
  error?: string;
  updatedAt: string;
};

export type TimeTravelProgress = {
  scene: number; // 1..4, the scene the player is on
  collectedClueIds: string[];
  mentor: {
    attempts: number;
    hintsShown: number;
    passed: boolean;
    usedFallback: boolean;
    highlightedClueId: string | null;
  };
  finished: boolean;
};

export type PlayState = {
  gameId: string;
  chapters: Record<string, ChapterStatus>;
  timeTravel: Record<string, TimeTravelProgress>;
  /** Saved when the era is finished; the teaching room reads these. */
  fieldNotes: Record<string, FieldNote[]>;
  teachingUnlocked: Record<string, boolean>;
  /** Written by the assessment room (half-truths found); fed to the next chapter's Agent 2 call. */
  knowledgeDebt: Record<string, KnowledgeDebt[]>;
};

const DATA_DIR = path.join(process.cwd(), "data");
const PLAY_DIR = path.join(DATA_DIR, "play");
const PACKS_DIR = path.join(DATA_DIR, "packs");
const SAFE_ID = /^[a-z0-9-]+$/;

const now = () => new Date().toISOString();

function initialPlayState(game: Game): PlayState {
  return {
    gameId: game.id,
    chapters: {},
    timeTravel: {},
    fieldNotes: {},
    teachingUnlocked: {},
    knowledgeDebt: {},
  };
}

/** Ensures every chapter has a status: chapter 1 available, the rest locked. */
function withAllChapters(game: Game, state: PlayState): PlayState {
  const sorted = [...game.chapters].sort((a, b) => a.week - b.week);
  sorted.forEach((c, i) => {
    const id = chapterIdFor(c.week);
    if (!state.chapters[id]) {
      state.chapters[id] = { state: i === 0 ? "available" : "locked", updatedAt: now() };
    }
  });
  return state;
}

async function readPlayState(game: Game): Promise<PlayState> {
  try {
    const raw = await fs.readFile(path.join(PLAY_DIR, `${game.id}.json`), "utf8");
    return withAllChapters(game, JSON.parse(raw) as PlayState);
  } catch {
    return withAllChapters(game, initialPlayState(game));
  }
}

async function writePlayState(state: PlayState): Promise<void> {
  await fs.mkdir(PLAY_DIR, { recursive: true });
  const file = path.join(PLAY_DIR, `${state.gameId}.json`);
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, file); // atomic replace
}

export async function getPlayState(game: Game): Promise<PlayState> {
  return readPlayState(game);
}

// One queue per game so read-modify-write updates never interleave
// (this is what makes "set generating before the API call" race-free).
const queues = new Map<string, Promise<unknown>>();

/**
 * Atomically read, change and save a game's play state.
 * `change` may throw to abort without saving.
 */
export function updatePlayState<T>(
  game: Game,
  change: (state: PlayState) => T,
): Promise<T> {
  const prev = queues.get(game.id) ?? Promise.resolve();
  const next = prev.then(async () => {
    const state = await readPlayState(game);
    const result = change(state);
    await writePlayState(state);
    return result;
  });
  queues.set(game.id, next.catch(() => undefined));
  return next;
}

export function setChapterState(
  state: PlayState,
  chapterId: string,
  next: ChapterState,
  error?: string,
): void {
  state.chapters[chapterId] = { state: next, updatedAt: now(), ...(error ? { error } : {}) };
}

// ---- chapter packs ----

function packPath(gameId: string, chapterId: string): string {
  if (!SAFE_ID.test(gameId) || !SAFE_ID.test(chapterId)) throw new Error("Invalid id");
  return path.join(PACKS_DIR, gameId, `${chapterId}.json`);
}

export async function getPack(gameId: string, chapterId: string): Promise<ChapterPack | null> {
  try {
    const raw = await fs.readFile(packPath(gameId, chapterId), "utf8");
    return ChapterPackSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Saves a pack once. Refuses to overwrite an existing pack (packs are never regenerated). */
export async function savePack(gameId: string, pack: ChapterPack): Promise<void> {
  const file = packPath(gameId, pack.chapter_id);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(pack, null, 2), { flag: "wx" });
}
