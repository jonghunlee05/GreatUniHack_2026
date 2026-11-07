import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { Game } from "@/lib/game-schema";
import { chapterIdFor, type Agent2Input, type ChapterPack } from "@/lib/chapter-pack";
import {
  getPack,
  savePack,
  savePackInput,
  setChapterState,
  updatePlayState,
  type ChapterState,
} from "@/lib/play-state";
import { describeClaudeError, getClaude, logTokens } from "@/lib/claude";
import { buildAgent2Input } from "./input";
import { validatePack, type ValidationResult } from "./validate";
import { MOCK_INPUT, MOCK_PACK } from "./mock";

const MOCK = () => process.env.AGENT2_MOCK === "true";
const MODEL = () => process.env.AGENT2_MODEL || "claude-opus-5-5";
const MAX_TOKENS = () => Number(process.env.AGENT2_MAX_TOKENS) || 16000;
/** A "generating" state older than this is treated as crashed and may be retried. */
const STALE_MS = 10 * 60 * 1000;

export class GenerateError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export type GenerateResult = { state: ChapterState; error?: string };

/**
 * Generates and saves one chapter pack. Safe against double clicks:
 * the chapter is moved to "generating" atomically before any API call.
 */
export async function generateChapter(game: Game, chapterId: string): Promise<GenerateResult> {
  const chapter = game.chapters.find((c) => chapterIdFor(c.week) === chapterId);
  if (!chapter) throw new GenerateError("Chapter not found.", 404);

  // A saved pack is never regenerated.
  if (await getPack(game.id, chapterId)) {
    await updatePlayState(game, (s) => {
      if (s.chapters[chapterId]?.state === "generating") setChapterState(s, chapterId, "ready");
    });
    throw new GenerateError("This chapter has already been generated.", 409);
  }

  // Claim: only from available / failed (or a crashed "generating").
  await updatePlayState(game, (s) => {
    const current = s.chapters[chapterId];
    const stale =
      current?.state === "generating" && Date.now() - Date.parse(current.updatedAt) > STALE_MS;
    if (current?.state !== "available" && current?.state !== "failed" && !stale) {
      throw new GenerateError(
        current?.state === "locked"
          ? "This chapter is locked. Finish the previous chapter first."
          : current?.state === "generating"
            ? "This chapter is already being generated."
            : "This chapter has already been generated.",
        409,
      );
    }
    setChapterState(s, chapterId, "generating");
  });

  try {
    const { pack, input } = MOCK()
      ? await runMock(game, chapterId)
      : await runReal(game, chapterId, chapter.week);
    await savePackInput(game.id, chapterId, input);
    await savePack(game.id, pack);
    await updatePlayState(game, (s) => setChapterState(s, chapterId, "ready"));
    return { state: "ready" };
  } catch (error) {
    const message =
      error instanceof GenerateError ? error.message : describeClaudeError(error);
    await updatePlayState(game, (s) => setChapterState(s, chapterId, "failed", message));
    return { state: "failed", error: message };
  }
}

/** Mock mode: the hand-written MATS23801 pack, validated, no API call. */
type RunResult = { pack: ChapterPack; input: Agent2Input };

async function runMock(game: Game, chapterId: string): Promise<RunResult> {
  await new Promise((r) => setTimeout(r, 1500)); // let the loading animation show
  const result = validatePack(MOCK_PACK, MOCK_INPUT);
  await logTokens({
    agent: "agent2",
    model: "mock",
    gameId: game.id,
    chapterId,
    inputTokens: 0,
    outputTokens: 0,
    ok: result.ok,
    mock: true,
  });
  if (!result.ok) throw new GenerateError(`Mock pack failed validation: ${result.errors[0]}`, 500);
  return { pack: { ...result.pack, chapter_id: chapterId }, input: MOCK_INPUT };
}

async function runReal(game: Game, chapterId: string, week: number): Promise<RunResult> {
  const prevChapter = game.chapters
    .filter((c) => c.week < week)
    .sort((a, b) => b.week - a.week)[0];
  const prevId = prevChapter ? chapterIdFor(prevChapter.week) : null;
  const chapter = game.chapters.find((c) => c.week === week)!;

  let knowledgeDebt: Agent2Input["previous_chapter"]["knowledge_debt"] = [];
  if (prevId) {
    await updatePlayState(game, (s) => {
      knowledgeDebt = s.knowledgeDebt[prevId] ?? [];
    });
  }
  const input = buildAgent2Input(
    game,
    chapter,
    prevId ? { pack: await getPack(game.id, prevId), knowledgeDebt } : null,
  );

  // Fail fast (no tokens spent) when Agent 1 gave no history to work with.
  if (input.chapter.key_events.length === 0) {
    throw new GenerateError(
      "This chapter has no key events, so there is no real history to build an era from. Re-upload the course to regenerate the outline.",
      422,
    );
  }

  const system = await loadSystemPrompt();
  let lastErrors: string[] = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    const userText =
      JSON.stringify(input, null, 2) +
      (lastErrors.length
        ? `\n\nYour previous output failed these checks. Fix them:\n- ${lastErrors.join("\n- ")}`
        : "");

    // Plain JSON output, checked by our validator (the pack schema is too large
    // for API-enforced structured outputs).
    const response = await getClaude().beta.messages.create({
      model: MODEL(),
      max_tokens: MAX_TOKENS(),
      system,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: userText }],
    });

    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const raw = parseJson(text);

    const result: ValidationResult =
      response.stop_reason === "refusal"
        ? { ok: false, errors: ["The model declined to generate this chapter."] }
        : response.stop_reason === "max_tokens"
          ? { ok: false, errors: ["Output hit the max token limit before finishing."] }
          : raw
            ? validatePack(raw, input)
            : { ok: false, errors: ["Output was not valid JSON."] };

    await logTokens({
      agent: "agent2",
      model: MODEL(),
      gameId: game.id,
      chapterId,
      attempt,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      ok: result.ok,
      note: result.ok ? undefined : result.errors.slice(0, 3).join(" | "),
    });

    if (result.ok) return { pack: { ...result.pack, chapter_id: chapterId }, input };
    lastErrors = result.errors;
    await saveRejectedOutput(game.id, chapterId, attempt, text, result.errors);
  }

  throw new GenerateError(
    `Generation failed validation twice. First problem: ${lastErrors[0] ?? "unknown"}`,
    502,
  );
}

/** Keeps rejected outputs in data/logs/rejected so they can be checked without paying again. */
async function saveRejectedOutput(
  gameId: string,
  chapterId: string,
  attempt: number,
  text: string,
  errors: string[],
): Promise<void> {
  try {
    const dir = path.join(process.cwd(), "data", "logs", "rejected");
    await fs.mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await fs.writeFile(
      path.join(dir, `${gameId}-${chapterId}-${stamp}-attempt${attempt}.json`),
      JSON.stringify({ errors, text }, null, 2),
    );
  } catch {
    // never block generation on debug logging
  }
}

/** Parses the model's JSON, tolerating a ```json fence or text around the object. */
function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * System prompt = the code block under "## 3. System prompt" in the spec file,
 * followed by the output schema from section 4 (the model needs to see it).
 */
async function loadSystemPrompt(): Promise<string> {
  const file = path.join(process.cwd(), "..", "..", "prompts", "agent2-event-generator.md");
  const md = await fs.readFile(file, "utf8");
  const prompt = (md.split("## 3. System prompt")[1] ?? "").match(/```\n([\s\S]*?)\n```/);
  const schema = (md.split("## 4. Output schema")[1] ?? "").match(/```json\n([\s\S]*?)\n```/);
  if (!prompt || !schema) throw new GenerateError("Could not read the Agent 2 system prompt.", 500);
  return `${prompt[1].trim()}\n\nSCHEMA (field names and structure to follow exactly; replace the example values):\n${schema[1].trim()}`;
}
