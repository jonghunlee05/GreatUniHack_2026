import "server-only";
import { promises as fs } from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { GeneratedGameSchema, type GeneratedGame } from "@/lib/game-schema";
import type { IngestedFile } from "./ingest";

const MODEL = "claude-opus-5-5";

// The generator's instructions live in the repo-level prompts/ folder so they
// can be versioned and edited without touching code.
const SKILL_PATH = path.join(
  process.cwd(),
  "..",
  "..",
  "prompts",
  "game-generator",
  "skills.md",
);

export class GeneratorError extends Error {}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new GeneratorError(
      "No Claude API key found. Set ANTHROPIC_API_KEY in apps/web/.env.local and restart the server.",
    );
  }
  client ??= new Anthropic();
  return client;
}

export async function generateGame(
  files: IngestedFile[],
  courseHint: string,
): Promise<GeneratedGame> {
  const skill = await fs.readFile(SKILL_PATH, "utf8");

  const fileList = files.map((f) => `- ${f.meta.name}`).join("\n");
  const instruction =
    `Build a Teach Alex game from the course materials above.\n\n` +
    `Uploaded files:\n${fileList}\n` +
    (courseHint ? `\nThe student describes the course as: "${courseHint}"\n` : "");

  const anthropic = getClient();
  let response;
  try {
    response = await anthropic.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: skill,
      output_config: {
        effort: "medium",
        format: betaZodOutputFormat(GeneratedGameSchema),
      },
      // If a safety classifier declines, the API retries on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [
        {
          role: "user",
          content: [...files.map((f) => f.block), { type: "text", text: instruction }],
        },
      ],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new GeneratorError(
        "Claude API key missing or invalid. Set ANTHROPIC_API_KEY in apps/web/.env.local.",
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new GeneratorError("Rate limited by the Claude API. Try again in a minute.");
    }
    if (error instanceof Anthropic.BadRequestError) {
      throw new GeneratorError(`The Claude API rejected the request: ${error.message}`);
    }
    if (error instanceof Anthropic.APIError) {
      throw new GeneratorError(`Claude API error (${error.status}): ${error.message}`);
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new GeneratorError("The model declined to generate a game from these materials.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new GeneratorError(
      "The course was too large to generate in one go. Try uploading fewer files.",
    );
  }
  if (!response.parsed_output) {
    throw new GeneratorError("The generator returned an unexpected format. Please try again.");
  }
  return response.parsed_output;
}
