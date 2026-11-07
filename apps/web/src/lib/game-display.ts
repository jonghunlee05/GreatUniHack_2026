import type { Game } from "./game-schema";

/** "MATS23801: Biomaterials…" → "MATS23801". Falls back to the full course name. */
export function courseCode(game: Game): string {
  const match = game.course.name.match(/^([A-Z]{2,6}\s?\d{3,6}[A-Z]?)/);
  return match ? match[1] : game.course.name;
}

export function iloCount(game: Game): number {
  return game.chapters.reduce((n, c) => n + c.ilos.length, 0);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB");
}

/**
 * Player progress for a game.
 * TODO: derive from assessment Attempt records once the assessment room saves them.
 * Until then every game starts at zero.
 */
export function gameProgress(game: Game) {
  return {
    completedChapters: 0,
    stars: 0,
    maxStars: game.chapters.length * 3,
    currentWeek: 1,
  };
}
