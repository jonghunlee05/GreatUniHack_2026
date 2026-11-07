import { z } from "zod";

/**
 * Shape the AI game generator must return.
 * Keep in sync with prompts/game-generator/skills.md.
 */
export const IloSchema = z.object({
  id: z.string().describe('Format "W<week>.<n>", e.g. "W2.1"'),
  statement: z.string(),
  bloomLevel: z.enum([
    "remember",
    "understand",
    "apply",
    "analyse",
    "evaluate",
    "create",
  ]),
  keyConcepts: z.array(z.string()),
});

export const ChapterSchema = z.object({
  week: z.number().int(),
  title: z.string(),
  summary: z.string(),
  era: z.object({
    name: z.string(),
    years: z.string().describe('e.g. "1930s" or "1960s-1980s"'),
    problem: z.string(),
  }),
  ilos: z.array(IloSchema).describe("The first ILO is the chapter's main ILO"),
  /** Real historical events behind this chapter's concepts. Agent 2 may only use these. */
  keyEvents: z.array(
    z.object({
      year: z.string().describe('e.g. "1839" or "c. 1800"'),
      person: z.string(),
      event: z.string(),
    }),
  ),
  sourceRefs: z.array(
    z.object({
      file: z.string(),
      location: z.string(),
      page: z.number().int().nullable().describe("First page or slide number, or null"),
      excerpt: z.string().describe("Short passage from the source that supports this chapter"),
    }),
  ),
});

export const GeneratedGameSchema = z.object({
  title: z.string(),
  course: z.object({
    name: z.string(),
    subject: z.string(),
    level: z.string(),
    summary: z.string(),
  }),
  chapters: z.array(ChapterSchema),
  generatorNotes: z.string(),
});

export type Ilo = z.infer<typeof IloSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
export type GeneratedGame = z.infer<typeof GeneratedGameSchema>;

export type SourceFile = {
  name: string;
  kind: "pdf" | "slides" | "notes";
  sizeBytes: number;
};

/** A game as stored on disk. */
export type Game = GeneratedGame & {
  id: string;
  createdAt: string;
  sourceFiles: SourceFile[];
};
