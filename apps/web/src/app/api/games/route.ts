import { randomUUID } from "crypto";
import { generateGame, GeneratorError } from "@/features/new-game/generator";
import { ingestFile, IngestError, MAX_TOTAL_BYTES } from "@/features/new-game/ingest";
import { saveGame } from "@/lib/storage";
import type { Game } from "@/lib/game-schema";

/** POST /api/games: multipart form with `files` (1+) and optional `courseHint`. */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected a multipart form upload." }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const courseHint = String(form.get("courseHint") ?? "").trim().slice(0, 300);

  if (files.length === 0) {
    return Response.json({ error: "Upload at least one file." }, { status: 400 });
  }
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return Response.json(
      { error: `Uploads total ${(totalBytes / 1e6).toFixed(1)} MB; the limit is 24 MB.` },
      { status: 413 },
    );
  }

  try {
    const ingested = await Promise.all(files.map(ingestFile));
    const generated = await generateGame(ingested, courseHint);

    const game: Game = {
      ...generated,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      sourceFiles: ingested.map((f) => f.meta),
    };
    await saveGame(game);
    return Response.json({ id: game.id }, { status: 201 });
  } catch (error) {
    if (error instanceof IngestError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof GeneratorError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    console.error("Game generation failed", error);
    return Response.json({ error: "Something went wrong generating the game." }, { status: 500 });
  }
}
