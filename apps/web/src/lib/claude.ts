import "server-only";
import { promises as fs } from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";

/** Shared Claude client for Agent 2 and the examiner. Reads ANTHROPIC_API_KEY. */
let client: Anthropic | null = null;
export function getClaude(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new Error("No Claude API key found. Set ANTHROPIC_API_KEY in apps/web/.env.local.");
  }
  client ??= new Anthropic();
  return client;
}

/** Turns an SDK error into a short readable message. */
export function describeClaudeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return "Claude API key missing or invalid.";
  if (error instanceof Anthropic.RateLimitError) return "Rate limited by the Claude API. Try again in a minute.";
  if (error instanceof Anthropic.APIError) {
    // Prefer the API's own short message over the raw JSON body.
    const body = error.error as { error?: { message?: string } } | undefined;
    const detail = body?.error?.message ?? error.message;
    return error instanceof Anthropic.BadRequestError
      ? `The Claude API rejected the request: ${detail}`
      : `Claude API error (${error.status}): ${detail}`;
  }
  return error instanceof Error ? error.message : "Unknown error calling Claude.";
}

export type TokenLog = {
  agent: "agent2" | "examiner";
  model: string;
  gameId: string;
  chapterId: string;
  attempt?: number;
  inputTokens: number;
  outputTokens: number;
  ok: boolean;
  mock?: boolean;
  note?: string;
};

/** Logs tokens for every call: to the console and to data/logs/tokens.jsonl. */
export async function logTokens(entry: TokenLog): Promise<void> {
  const line = { at: new Date().toISOString(), ...entry };
  console.log(
    `[tokens] ${entry.agent} ${entry.gameId}/${entry.chapterId}` +
      `${entry.attempt ? ` attempt ${entry.attempt}` : ""} model=${entry.model}` +
      ` in=${entry.inputTokens} out=${entry.outputTokens} ok=${entry.ok}${entry.mock ? " (mock)" : ""}`,
  );
  try {
    const dir = path.join(process.cwd(), "data", "logs");
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(path.join(dir, "tokens.jsonl"), JSON.stringify(line) + "\n");
  } catch {
    // logging must never break a request
  }
}
