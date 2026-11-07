import { spawn } from "child_process";
import path from "path";
import { getGame } from "@/lib/storage";
import { chapterIdFor } from "@/lib/chapter-pack";
import { getPack, setChapterState, updatePlayState } from "@/lib/play-state";

/**
 * POST /api/alex — thin bridge to the Python Agent 3 (`python -m purple.web_bridge`).
 * All teaching logic stays in Python; this route only loads the chapter server-side,
 * runs the bridge, and coalesces duplicate submissions by turn/response ID.
 */

const REPO_ROOT = path.resolve(process.cwd(), "..", "..");
const PYTHON = process.env.ALEX_PYTHON ?? path.join(REPO_ROOT, ".venv", "bin", "python");
const TIMEOUT_MS = 60_000;
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const COMMANDS = new Set([
  "turn", "action", "transcribe", "speak", "status",
  "mission_load", "mission_decide", "mission_why", "mission_finish",
]);
const NEEDS_CHAPTER = new Set(["turn", "action", "mission_load", "mission_decide", "mission_why", "mission_finish"]);

// Same turn ID twice (double click, retry, React re-render) → one Python/Claude call.
const results = new Map<string, Promise<BridgeResponse>>();
const MAX_CACHED = 300;

type BridgeResponse = { ok: boolean; error?: string; [key: string]: unknown };

function runBridge(payload: object): Promise<BridgeResponse> {
  return new Promise((resolve) => {
    const child = spawn(PYTHON, ["-m", "purple.web_bridge"], { cwd: REPO_ROOT, env: process.env });
    let stdout = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", () => {}); // tracebacks stay server-side
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ ok: false, error: `Could not start Python Agent 3 (${PYTHON}). Set ALEX_PYTHON.` });
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(stdout) as BridgeResponse);
      } catch {
        resolve({ ok: false, error: "Alex took too long or crashed. Try again." });
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return Response.json({ ok: false, error: "Request too large." }, { status: 413 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }
  const command = String(body.command ?? "");
  if (!COMMANDS.has(command)) return Response.json({ ok: false, error: "Unknown command." }, { status: 400 });

  const payload: Record<string, unknown> = { ...body };
  const game = NEEDS_CHAPTER.has(command) ? await getGame(String(body.gameId ?? "")) : null;
  if (NEEDS_CHAPTER.has(command)) {
    if (!game) return Response.json({ ok: false, error: "Game not found." }, { status: 404 });
    const chapter = game.chapters.find((item) => item.week === Number(body.chapterWeek));
    if (!chapter) return Response.json({ ok: false, error: "Chapter not found." }, { status: 404 });
    payload.game = { id: game.id, course: game.course };
    payload.chapter = chapter;
    // Missions are built from Agent 2's cached chapter pack (read-only; never regenerated here).
    if (command.startsWith("mission_")) payload.pack = await getPack(game.id, chapterIdFor(chapter.week));
  }

  const id = command === "speak" ? body.responseId : body.turnId;
  const cacheKey = typeof id === "string" && id ? `${command}:${body.gameId ?? ""}:${id}` : null;
  let pending = cacheKey ? results.get(cacheKey) : undefined;
  if (!pending) {
    pending = runBridge(payload);
    if (cacheKey) {
      results.set(cacheKey, pending);
      if (results.size > MAX_CACHED) results.delete(results.keys().next().value as string);
      // Failures may be retried with the same ID.
      pending.then((r) => { if (!r.ok) results.delete(cacheKey); });
    }
  }
  const response = await pending;
  if (command === "mission_finish" && response.ok && game) {
    await recordAssessment(game, response, Number(body.chapterWeek), payload.pack != null);
  }
  return Response.json(response, { status: response.ok ? 200 : 502 });
}

type Report = { passed: boolean; stars: number; feedback: { recommendedRevision: string } | null };

/** Writes the result through the existing chapter progression (idempotent: safe on retries). */
async function recordAssessment(
  game: NonNullable<Awaited<ReturnType<typeof getGame>>>,
  response: BridgeResponse,
  week: number,
  hasPack: boolean,
) {
  const report = response.report as Report | undefined;
  if (!report || !week) return;
  const id = chapterIdFor(week);
  try {
    await updatePlayState(game, (state) => {
      state.stars = { ...(state.stars ?? {}), [id]: Math.max(state.stars?.[id] ?? 0, report.stars) };
      if (report.passed) {
        // "completed" makes play-state unlock the next chapter (unlockNextChapter is idempotent).
        // Only for chapters whose era pack exists: Time-travel treats "completed" as a replayable
        // era, so marking a never-generated chapter completed would break its era page.
        if (hasPack && state.chapters[id]?.state !== "completed") setChapterState(state, id, "completed");
      } else if (report.feedback) {
        state.knowledgeDebt[id] = [{ half_truth: report.feedback.recommendedRevision, fix: "Re-teach in the Teaching Room" }];
      }
    });
  } catch (error) {
    console.error("Couldn't record assessment result", error);
  }
}
