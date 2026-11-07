import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Game } from "@/lib/game-schema";
import { ChapterPackSchema, chapterIdFor, type Agent2Input, type ChapterPack } from "@/lib/chapter-pack";
import {
  getPack,
  savePack,
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
    const pack = MOCK() ? await runMock(game, chapterId) : await runReal(game, chapterId, chapter.week);
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
async function runMock(game: Game, chapterId: string): Promise<ChapterPack> {
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
  return { ...result.pack, chapter_id: chapterId };
}

async function runReal(game: Game, chapterId: string, week: number): Promise<ChapterPack> {
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

    const response = await getClaude().beta.messages.parse({
      model: MODEL(),
      max_tokens: MAX_TOKENS(),
      system,
      output_config: { effort: "medium", format: betaZodOutputFormat(ChapterPackSchema) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: userText }],
    });

    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    let raw: unknown = response.parsed_output;
    if (!raw) {
      try {
        raw = JSON.parse(text);
      } catch {
        raw = null;
      }
    }

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

    if (result.ok) return { ...result.pack, chapter_id: chapterId };
    lastErrors = result.errors;
  }

  throw new GenerateError(
    `Generation failed validation twice. First problem: ${lastErrors[0] ?? "unknown"}`,
    502,
  );
}

/** System prompt = the code block under "## 3. System prompt" in the spec file. */
async function loadSystemPrompt(): Promise<string> {
  const file = path.join(process.cwd(), "..", "..", "prompts", "agent2-event-generator.md");
  const md = await fs.readFile(file, "utf8");
  const section = md.split("## 3. System prompt")[1] ?? "";
  const match = section.match(/```\n([\s\S]*?)\n```/);
  if (!match) throw new GenerateError("Could not read the Agent 2 system prompt.", 500);
  return match[1].trim();
}
