import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { Game } from "./game-schema";

// JSON-file storage for the prototype. Lives in apps/web/data/games (gitignored).
const GAMES_DIR = path.join(process.cwd(), "data", "games");

const ID_PATTERN = /^[a-z0-9-]+$/;

export async function saveGame(game: Game): Promise<void> {
  await fs.mkdir(GAMES_DIR, { recursive: true });
  await fs.writeFile(
    path.join(GAMES_DIR, `${game.id}.json`),
    JSON.stringify(game, null, 2),
  );
}

export async function getGame(id: string): Promise<Game | null> {
  if (!ID_PATTERN.test(id)) return null;
  try {
    const raw = await fs.readFile(path.join(GAMES_DIR, `${id}.json`), "utf8");
    return normalizeGame(JSON.parse(raw) as Game);
  } catch {
    return null;
  }
}

/**
 * Games created before keyEvents / source excerpts existed lack those fields.
 * Fill safe defaults so the rest of the app can rely on the current shape.
 */
function normalizeGame(game: Game): Game {
  return {
    ...game,
    chapters: game.chapters.map((c) => ({
      ...c,
      keyEvents: c.keyEvents ?? [],
      sourceRefs: c.sourceRefs.map((s) => ({
        ...s,
        page: s.page ?? null,
        excerpt: s.excerpt ?? "",
      })),
    })),
  };
}

export async function listGames(): Promise<Game[]> {
  let files: string[];
  try {
    files = await fs.readdir(GAMES_DIR);
  } catch {
    return [];
  }
  const games = await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map((f) => getGame(f.replace(/\.json$/, ""))),
  );
  return games
    .filter((g): g is Game => g !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
