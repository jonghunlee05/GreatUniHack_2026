import { getGame } from "@/lib/storage";
import { answerMentor, ProgressError } from "@/features/time-travel/progress";

/**
 * POST /api/games/:id/chapters/:chapterId/mentor
 * Body: { answer: string } (free text) or { mcqIndex: number } (fallback).
 * Never returns the correct answer, key points or unrevealed hints.
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/games/[id]/chapters/[chapterId]/mentor">,
) {
  const { id, chapterId } = await params;
  const game = await getGame(id);
  if (!game) return Response.json({ error: "Game not found." }, { status: 404 });

  let body: { answer?: string; mcqIndex?: number };
  try {
    const raw = (await request.json()) as Record<string, unknown>;
    body = {
      answer: typeof raw.answer === "string" ? raw.answer.slice(0, 1500) : undefined,
      mcqIndex: typeof raw.mcqIndex === "number" ? raw.mcqIndex : undefined,
    };
    if (!body.answer?.trim() && body.mcqIndex === undefined) throw new Error("empty");
  } catch {
    return Response.json({ error: "Write an answer first." }, { status: 400 });
  }

  try {
    return Response.json(await answerMentor(game, chapterId, body));
  } catch (error) {
    if (error instanceof ProgressError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Mentor answer failed", error);
    return Response.json({ error: "Could not check your answer." }, { status: 500 });
  }
}
