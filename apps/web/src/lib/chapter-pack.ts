import { z } from "zod";

/**
 * Agent 2's chapter pack: exactly the output schema in
 * prompts/agent2-event-generator.md, section 4 (snake_case kept on purpose).
 *
 * Shared contract:
 *  - concepts + era.*      → Time-travel (Justin)
 *  - era.field_notes       → Teaching room (Shasha)
 *  - assessment.*          → Assessment room (Shasha)
 */

const ConceptIds = z.array(z.string());

export const ConceptSchema = z.object({
  id: z.string(),
  statement: z.string(),
});

/*
 * Optional extras (scene art, hidden clues, mentor chat, experiment).
 * Everything here uses .catch(): a malformed extra is dropped or defaulted,
 * never a reason to reject the chapter. The renderer falls back to default art.
 */
const loose = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

export const SceneArtSchema = z.object({
  location: z.string().catch("study"),
  view: z.string().catch("none"),
  time: z.string().catch("day"),
  weather: z.string().catch("clear"),
  ambient: z.string().catch("none"),
  props: z.array(z.string()).catch([]),
  poses: z.array(z.object({ name: z.string(), pose: z.string() })).catch([]),
});

export const SceneSchema = z.object({
  n: z.number().int(),
  type: z.enum(["problem", "failed_attempts", "breakthrough", "todays_rule"]),
  text: z.string(),
  dialogue: z.array(z.object({ speaker: z.string(), line: z.string() })),
  clue_ids: z.array(z.string()),
  concept_ids: ConceptIds,
  art: loose(SceneArtSchema),
});

export const MentorChatSchema = z.object({
  scene: z.number().int(),
  options: z.array(z.object({ ask: z.string(), reply: z.string() })),
});

const Prediction = z.object({
  question: z.string(),
  options: z.array(z.string()),
  correct_index: z.number().int(),
});

export const ExperimentSchema = z.object({
  scene: z.number().int(),
  template: z.enum(["slider", "sort", "order", "match", "numeric"]),
  title: z.string(),
  prompt: z.string(),
  prediction: loose(Prediction),
  /** Template-specific; checked and repaired in validate.ts. */
  data: z.record(z.string(), z.unknown()),
  reveal: z.string(),
  concept_ids: ConceptIds.catch([]),
});

export const ClueSchema = z.object({
  id: z.string(),
  /** "course_material" clues must cite a source_id; other types (artefact, document, …) are free. */
  type: z.string(),
  title: z.string(),
  text: z.string(),
  source_id: z.string().optional(),
  concept_ids: ConceptIds,
  /** Optional: the scene prop this clue is hidden in (click the prop to find it). */
  prop: z.string().optional().catch(undefined),
});

export const EraSchema = z.object({
  setting: z.object({
    place: z.string(),
    year: z.string(),
    skin: z.enum(["sepia", "postwar", "chemlab", "modern"]).catch("sepia"),
  }),
  cast: z.array(
    z.object({
      name: z.string(),
      role: z.enum(["lead", "cameo"]).catch("cameo"),
      event_ids: z.array(z.string()),
      scenes: z.array(z.number().int()),
    }),
  ),
  scenes: z.array(SceneSchema),
  clues: z.array(ClueSchema),
  mentor_question: z.object({
    asked_by: z.string(),
    scene: z.number().int(),
    question: z.string(),
    key_points: z.array(z.string()),
    hints: z.array(z.string()),
    mcq_fallback: z.object({
      options: z.array(z.string()),
      correct_index: z.number().int(),
    }),
  }),
  field_notes: z.array(z.object({ concept_id: z.string(), note: z.string() })),
  what_really_happened: z.object({
    summary: z.string(),
    event_ids: z.array(z.string()),
  }),
  mentor_chat: loose(MentorChatSchema),
  experiment: loose(ExperimentSchema),
});

export const AssessmentSchema = z.object({
  briefing: z.object({
    title: z.string(),
    situation: z.string(),
    task: z.string(),
    objective: z.string(),
  }),
  stage1_investigate: z.object({
    evidence: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        text: z.string(),
        relevant: z.boolean(),
        concept_ids: ConceptIds,
      }),
    ),
  }),
  stage2_alex_decides: z.object({
    decision_prompt: z.string(),
    correct_decision: z.string(),
    requires_concepts: ConceptIds,
    likely_mistakes: z.array(
      z.object({
        id: z.string(),
        alex_says: z.string(),
        missing_concept: z.string(),
        why_wrong: z.string(),
      }),
    ),
  }),
  stage3_curveball: z.object({
    new_condition: z.string(),
    correct_response: z.string(),
    tests_concepts: ConceptIds,
    exposes_debt: z.string().nullable(),
  }),
  scoring: z.object({
    stage1_points: z.number().int(),
    stage2_points: z.number().int(),
    stage3_points: z.number().int(),
    pass_mark: z.number().int(),
  }),
});

export const ChapterPackSchema = z.object({
  chapter_id: z.string(),
  main_ilo: z.string(),
  concepts: z.array(ConceptSchema),
  era: EraSchema,
  assessment: AssessmentSchema,
});

export type Concept = z.infer<typeof ConceptSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type Clue = z.infer<typeof ClueSchema>;
export type Era = z.infer<typeof EraSchema>;
export type Assessment = z.infer<typeof AssessmentSchema>;
export type ChapterPack = z.infer<typeof ChapterPackSchema>;
export type FieldNote = Era["field_notes"][number];
export type SceneArt = z.infer<typeof SceneArtSchema>;
export type MentorChat = z.infer<typeof MentorChatSchema>;
export type Experiment = z.infer<typeof ExperimentSchema>;

/** Agent 2 input (spec section 2). */
export type KeyEvent = { id: string; year: string; person: string; event: string };
export type PackSource = { id: string; file: string; page: number | null; excerpt: string };
export type KnowledgeDebt = { half_truth: string; fix: string };

export type Agent2Input = {
  course: { code: string; title: string };
  chapter: {
    chapter_id: string;
    week: number;
    title: string;
    main_ilo: string;
    supporting_ilos: string[];
    key_events: KeyEvent[];
    sources: PackSource[];
  };
  previous_chapter: {
    concepts: Concept[];
    knowledge_debt: KnowledgeDebt[];
  };
};

/** Stable chapter id used everywhere ("ch1", "ch2", …). */
export function chapterIdFor(week: number): string {
  return `ch${week}`;
}
