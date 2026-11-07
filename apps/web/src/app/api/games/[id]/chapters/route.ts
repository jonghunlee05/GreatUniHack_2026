import { getGame } from "@/lib/storage";
import { getPlayState } from "@/lib/play-state";

/** GET /api/games/:id/chapters → { chapters: { ch1: { state, error? }, … } } (for polling). */
export async function GET(_request: Request, { params }: RouteContext<"/api/games/[id]/chapters">) {
  const { id } = await params;
  const game = await getGame(id);
  if (!game) return Response.json({ error: "Game not found." }, { status: 404 });
  const play = await getPlayState(game);
  return Response.json({ chapters: play.chapters });
}
