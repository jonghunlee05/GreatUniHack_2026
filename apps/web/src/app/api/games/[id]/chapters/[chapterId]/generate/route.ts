import { getGame } from "@/lib/storage";
import { generateChapter, GenerateError } from "@/features/agent2/generate";

/**
 * POST /api/games/:id/chapters/:chapterId/generate
 * Runs Agent 2 for one chapter. Allowed only when the chapter is
 * "available" or "failed"; all checks happen on the server.
 * Returns { state, error? }.
 */
export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/games/[id]/chapters/[chapterId]/generate">,
) {
  const { id, chapterId } = await params;
  const game = await getGame(id);
  if (!game) return Response.json({ error: "Game not found." }, { status: 404 });

  try {
    const result = await generateChapter(game, chapterId);
    return Response.json(result, { status: result.state === "ready" ? 201 : 502 });
  } catch (error) {
    if (error instanceof GenerateError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Agent 2 failed", error);
    return Response.json({ error: "Something went wrong generating this chapter." }, { status: 500 });
  }
}
