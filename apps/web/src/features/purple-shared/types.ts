import type { Chapter, Game } from "@/lib/game-schema";

export type KnowledgeLevel = 0 | 1 | 2 | 3;

export type ConceptKnowledge = {
  conceptId: string;
  label: string;
  level: KnowledgeLevel;
  evidence: string[];
  missingPoints: string[];
  misconceptions: string[];
  confidence: number;
  lastUpdatedTurn: number;
};

export type BrainState = {
  chapterWeek: number;
  turn: number;
  concepts: Record<string, ConceptKnowledge>;
};

export type TeachingMessage = {
  id: string;
  role: "student" | "alex";
  text: string;
  /** Agent 3 metadata (optional; older saved conversations lack it). */
  strategy?: string;
  reaction?: string;
  modality?: "text" | "voice" | "image" | "action";
};

export type Decision = {
  phase: "initial" | "curveball";
  actionId: string;
  success: boolean;
  assisted: boolean;
  reasoning: string;
  consequence: string;
};

export type AttemptState = {
  chapterWeek: number;
  phase: "evidence" | "decision" | "curveball" | "report";
  inspectedEvidence: string[];
  selectedEvidence: string[];
  hintsUsed: number;
  interventions: string[];
  decisions: Decision[];
  diagnosis: string | null;
  completed: boolean;
  score: number | null;
  scoreParts: Record<string, number>;
  rematch: number;
};

export type PurpleState = {
  version: 1;
  currentChapterWeek: number;
  brains: Record<string, BrainState>;
  conversations: Record<string, TeachingMessage[]>;
  attempts: Record<string, AttemptState>;
  previousAttempts: AttemptState[];
  repairTarget: string | null;
  /** Agent 3 AlexState per chapter, stored opaquely and round-tripped to /api/alex. */
  alexStates?: Record<string, unknown>;
  /** Chapter progression: completions per week (unlocks are derived in progression.tsx). */
  progress?: Record<string, { teachingCompleted?: boolean; assessmentCompleted?: boolean }>;
};

export type TeachingEvaluation = {
  conceptId: string;
  nextQuestion: string;
  level: KnowledgeLevel;
  misconception: string | null;
};

export type EvidenceCard = {
  id: string;
  title: string;
  detail: string;
  source: string;
  relevant: boolean;
};

export type MissionTask = {
  title: string;
  scenario: string;
  objective: string;
  evidence: EvidenceCard[];
  correctAction: string;
  actions: { id: string; label: string }[];
  curveball: string;
  explanation: string;
};

export function chapterKey(week: number) {
  return String(week);
}

export function conceptId(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "core-concept";
}

export function chapterConcepts(chapter: Chapter) {
  return Array.from(new Set(chapter.ilos.flatMap((ilo) => ilo.keyConcepts)));
}

export function initialBrain(chapter: Chapter): BrainState {
  const concepts = Object.fromEntries(
    chapterConcepts(chapter).map((label) => {
      const id = conceptId(label);
      const related = chapter.ilos.filter((ilo) => ilo.keyConcepts.includes(label));
      return [
        id,
        {
          conceptId: id,
          label,
          level: 0 as KnowledgeLevel,
          evidence: [],
          missingPoints: related.map((ilo) => ilo.statement),
          misconceptions: [],
          confidence: 0,
          lastUpdatedTurn: 0,
        },
      ];
    }),
  );
  if (Object.keys(concepts).length === 0) {
    const id = conceptId(chapter.title);
    concepts[id] = {
      conceptId: id,
      label: chapter.title,
      level: 0,
      evidence: [],
      missingPoints: [chapter.summary],
      misconceptions: [],
      confidence: 0,
      lastUpdatedTurn: 0,
    };
  }
  return { chapterWeek: chapter.week, turn: 0, concepts };
}

export function initialAttempt(chapter: Chapter, rematch = 0): AttemptState {
  return {
    chapterWeek: chapter.week,
    phase: "evidence",
    inspectedEvidence: [],
    selectedEvidence: [],
    hintsUsed: 0,
    interventions: [],
    decisions: [],
    diagnosis: null,
    completed: false,
    score: null,
    scoreParts: {},
    rematch,
  };
}

export function initialState(game: Game): PurpleState {
  const first = game.chapters[0];
  const brains = Object.fromEntries(game.chapters.map((chapter) => [chapterKey(chapter.week), initialBrain(chapter)]));
  const conversations: Record<string, TeachingMessage[]> = Object.fromEntries(
    game.chapters.map((chapter) => [
      chapterKey(chapter.week),
      [{ id: `alex-${chapter.week}-0`, role: "alex" as const, text: `I know almost nothing about ${chapter.title}. What should I understand first?` }],
    ]),
  );
  return {
    version: 1,
    currentChapterWeek: first?.week ?? 1,
    brains,
    conversations,
    attempts: {},
    previousAttempts: [],
    repairTarget: null,
  };
}
