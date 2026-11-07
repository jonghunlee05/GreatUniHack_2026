import "server-only";
import { notFound } from "next/navigation";
import { getGame } from "./storage";
import type { Game } from "./game-schema";

/** Loads the game for a /games/[id]/... route, or renders the 404 page. */
export async function loadGame(params: Promise<{ id: string }>): Promise<Game> {
  const { id } = await params;
  const game = await getGame(id);
  if (!game) notFound();
  return game;
}
