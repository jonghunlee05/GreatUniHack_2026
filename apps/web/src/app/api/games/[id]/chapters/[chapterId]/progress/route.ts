import { getGame } from "@/lib/storage";
import { applyAction, ProgressError, type ProgressAction } from "@/features/time-travel/progress";

/**
 * POST /api/games/:id/chapters/:chapterId/progress
 * Body: { type: "start" } | { type: "advance", scene } | { type: "collect", clueId } | { type: "finish" }
 * Returns the updated era view. Order and unlock rules are enforced on the server.
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/games/[id]/chapters/[chapterId]/progress">,
) {
  const { id, chapterId } = await params;
  const game = await getGame(id);
  if (!game) return Response.json({ error: "Game not found." }, { status: 404 });

  let action: ProgressAction;
  try {
    action = parseAction(await request.json());
  } catch {
    return Response.json({ error: "Invalid action." }, { status: 400 });
  }

  try {
    return Response.json(await applyAction(game, chapterId, action));
  } catch (error) {
    if (error instanceof ProgressError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Progress update failed", error);
    return Response.json({ error: "Could not save your progress." }, { status: 500 });
  }
}

function parseAction(body: unknown): ProgressAction {
  const b = body as Record<string, unknown>;
  switch (b?.type) {
    case "start":
    case "finish":
      return { type: b.type };
    case "advance":
      if (typeof b.scene === "number") return { type: "advance", scene: b.scene };
      break;
    case "collect":
      if (typeof b.clueId === "string") return { type: "collect", clueId: b.clueId };
      break;
  }
  throw new Error("invalid");
}
