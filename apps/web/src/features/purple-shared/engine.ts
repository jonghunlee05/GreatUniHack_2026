import type { Chapter } from "@/lib/game-schema";
import {
  chapterConcepts,
  conceptId,
  type AttemptState,
  type BrainState,
  type Decision,
  type KnowledgeLevel,
  type MissionTask,
  type TeachingEvaluation,
} from "./types";

const CAUSAL = ["because", "therefore", "so that", "causes", "leads to", "means that", "results in"];
const APPLICATION = ["for example", "if ", "when ", "in this case", "such as"];

function words(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

function overlap(left: string, right: string) {
  const a = words(left);
  const b = words(right);
  return [...a].filter((word) => word.length > 2 && b.has(word)).length;
}

export function evaluateTeaching(chapter: Chapter, brain: BrainState, text: string) {
  const entries = Object.values(brain.concepts);
  const selected = entries.reduce((best, item) => {
    const score = (candidate: typeof item) => {
      const objective = chapter.ilos.filter((ilo) => ilo.keyConcepts.includes(candidate.label)).map((ilo) => ilo.statement).join(" ");
      return overlap(candidate.label, text) * 3 + overlap(objective, text);
    };
    return score(item) > score(best) ? item : best;
  }, entries[0]);
  const previous = selected.level;
  const lower = text.toLowerCase();
  const mention = overlap(selected.label, text) > 0;
  const causal = CAUSAL.some((marker) => lower.includes(marker));
  const applied = APPLICATION.some((marker) => lower.includes(marker));
  const overgeneralised = /\b(always|never|impossible|cannot ever)\b/i.test(text);

  let level: KnowledgeLevel = previous;
  if (mention || text.trim().split(/\s+/).length >= 6) level = Math.max(level, 1) as KnowledgeLevel;
  if (mention && causal && text.trim().split(/\s+/).length >= 11) level = Math.max(level, 2) as KnowledgeLevel;
  if (previous >= 2 && applied && causal) level = 3;
  const misconception = overgeneralised ? `Possible overgeneralisation: “${text.trim()}”` : null;
  if (misconception) level = Math.min(level, 1) as KnowledgeLevel;

  const objective = chapter.ilos.find((ilo) => ilo.keyConcepts.includes(selected.label))?.statement ?? chapter.summary;
  const nextQuestion = misconception
    ? "That sounds absolute. What exception or evidence would test that claim?"
    : level === 0
      ? `I am not seeing the link to ${selected.label} yet. What causes what?`
      : level === 1
        ? `I recognise ${selected.label}. Why does it produce that result?`
        : level === 2
          ? `Can you apply ${selected.label} to a new example without repeating the definition?`
          : `What boundary case could make that application of ${selected.label} fail?`;

  const nextBrain: BrainState = {
    ...brain,
    turn: brain.turn + 1,
    concepts: {
      ...brain.concepts,
      [selected.conceptId]: {
        ...selected,
        level,
        evidence: level > previous || misconception ? [...selected.evidence, text.trim()] : selected.evidence,
        missingPoints: level >= 2 ? [] : [objective],
        misconceptions: misconception ? [...selected.misconceptions, misconception] : selected.misconceptions,
        confidence: Math.min(0.95, 0.4 + level * 0.17),
        lastUpdatedTurn: brain.turn + 1,
      },
    },
  };
  return { nextBrain, evaluation: { conceptId: selected.conceptId, nextQuestion, level, misconception } satisfies TeachingEvaluation };
}

export function makeMission(chapter: Chapter, rematch = 0): MissionTask {
  const concepts = chapterConcepts(chapter);
  const core = concepts[0] ?? chapter.title;
  const source = chapter.sourceRefs[0]
    ? `${chapter.sourceRefs[0].file} · ${chapter.sourceRefs[0].location}`
    : "Generated chapter context";
  const changed = rematch ? ` This is rematch ${rematch}, using newly collected observations.` : "";
  return {
    title: `${chapter.era.name}: Mission ${String(chapter.week).padStart(2, "0")}`,
    scenario: `${chapter.era.problem}${changed}`,
    objective: chapter.ilos[0]?.statement ?? `Apply ${core}`,
    evidence: [
      {
        id: "source",
        title: "Course record",
        detail: `${chapter.summary} The record directly connects the scenario to ${core}.`,
        source,
        relevant: true,
      },
      {
        id: "pattern",
        title: "Repeated observation",
        detail: `The same pattern appears whenever the condition described in the mission is repeated.`,
        source: "Validated mission observation",
        relevant: true,
      },
      {
        id: "opinion",
        title: "Unverified opinion",
        detail: "A teammate says the first idea that came to mind is probably correct.",
        source: "Team chat",
        relevant: false,
      },
      {
        id: "background",
        title: "Background detail",
        detail: `The event happened during ${chapter.era.years}; this fact alone does not identify the cause.`,
        source: "Mission metadata",
        relevant: false,
      },
    ],
    correctAction: "evidence-led",
    actions: [
      { id: "evidence-led", label: `Use the evidence to apply ${core}` },
      { id: "guess", label: "Act on the unverified opinion" },
      { id: "ignore", label: "Ignore the pattern and repeat the same approach" },
    ],
    curveball: `A new constraint changes one condition in the original ${chapter.era.problem.toLowerCase()} Alex must explain whether the same reasoning still transfers.`,
    explanation: `The course record and repeated observation jointly support applying ${core}; a date or an unsupported opinion does not.`,
  };
}

export function decide(
  brain: BrainState,
  task: MissionTask,
  selectedEvidence: string[],
  phase: Decision["phase"],
  assisted: boolean,
): Decision {
  const knowledge = Object.values(brain.concepts);
  const understood = knowledge.length > 0 && knowledge.every((item) => item.level >= 2);
  const misconception = knowledge.flatMap((item) => item.misconceptions)[0];
  const relevant = task.evidence.some((card) => card.relevant && selectedEvidence.includes(card.id));
  const success = !misconception && relevant && (understood || assisted);
  const actionId = success ? task.correctAction : misconception ? "guess" : "ignore";
  return {
    phase,
    actionId,
    success,
    assisted,
    reasoning: misconception
      ? `I copied this belief from teaching: ${misconception}`
      : success
        ? "The evidence matches the cause-and-effect rule stored in my knowledge cards."
        : "I saw a clue, but my stored knowledge was not strong enough to justify the correct action.",
    consequence: success
      ? phase === "curveball" ? "Alex transfers the idea to the changed condition." : "Mission objective met."
      : "The trial exposes a knowledge gap. No error was fabricated: this follows from Alex's stored state.",
  };
}

export function scoreAttempt(brain: BrainState, task: MissionTask, attempt: AttemptState) {
  const knowledge = Object.values(brain.concepts);
  const teaching = Math.round(30 * knowledge.reduce((sum, item) => sum + item.level / 3, 0) / Math.max(1, knowledge.length));
  const initial = attempt.decisions.find((item) => item.phase === "initial");
  const curveball = attempt.decisions.find((item) => item.phase === "curveball");
  const independent = initial?.success ? (initial.assisted ? 15 : 30) : 0;
  const transfer = curveball?.success ? (curveball.assisted ? 7 : 15) : 0;
  const relevantIds = task.evidence.filter((card) => card.relevant).map((card) => card.id);
  const relevantSelected = attempt.selectedEvidence.filter((id) => relevantIds.includes(id)).length;
  const irrelevantSelected = attempt.selectedEvidence.filter((id) => !relevantIds.includes(id)).length;
  const evidence = Math.max(0, Math.round(10 * relevantSelected / relevantIds.length) - irrelevantSelected * 2);
  const diagnosis = attempt.diagnosis && brain.concepts[attempt.diagnosis] ? 15 : 0;
  const parts = { teaching, independent, transfer, evidence, diagnosis };
  return { parts, total: Object.values(parts).reduce((sum, value) => sum + value, 0) };
}

export function conceptForRepair(brain: BrainState) {
  return Object.values(brain.concepts).sort((a, b) => a.level - b.level)[0]?.conceptId ?? null;
}

export { conceptId };
