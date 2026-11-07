import { ChapterPackSchema, type Agent2Input, type ChapterPack } from "@/lib/chapter-pack";

export type ValidationResult =
  | { ok: true; pack: ChapterPack }
  | { ok: false; errors: string[] };

const SCENE_ORDER = ["problem", "failed_attempts", "breakthrough", "todays_rule"] as const;

/**
 * Every check in spec section 5, plus a few integrity checks the UI relies on
 * (clue ids, mentor question, MCQ index). Returns readable error messages.
 */
export function validatePack(raw: unknown, input: Agent2Input): ValidationResult {
  // 1. Valid JSON matching the schema
  const parsed = ChapterPackSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues
        .slice(0, 5)
        .map((i) => `Schema: ${i.path.join(".") || "(root)"} ${i.message}`),
    };
  }
  const pack = parsed.data;
  const { era, assessment } = pack;
  const errors: string[] = [];

  // 2. main_ilo copied exactly
  if (pack.main_ilo !== input.chapter.main_ilo) {
    errors.push("main_ilo does not match the input exactly.");
  }

  // 3. 3–5 concepts, and every reference points at a real concept id
  const conceptIds = new Set(pack.concepts.map((c) => c.id));
  if (pack.concepts.length < 3 || pack.concepts.length > 5) {
    errors.push(`Expected 3–5 concepts, got ${pack.concepts.length}.`);
  }
  if (conceptIds.size !== pack.concepts.length) errors.push("Concept ids must be unique.");

  const checkRefs = (where: string, ids: string[], requireOne: boolean) => {
    if (requireOne && ids.length === 0) errors.push(`${where} must reference at least one concept.`);
    for (const id of ids) {
      if (!conceptIds.has(id)) errors.push(`${where} references unknown concept "${id}".`);
    }
  };
  era.scenes.forEach((s) => checkRefs(`Scene ${s.n}`, s.concept_ids, true));
  era.clues.forEach((c) => checkRefs(`Clue ${c.id}`, c.concept_ids, true));
  era.field_notes.forEach((f) => checkRefs("Field note", [f.concept_id], true));
  assessment.stage1_investigate.evidence.forEach((e) =>
    checkRefs(`Evidence ${e.id}`, e.concept_ids, e.relevant),
  );
  assessment.stage2_alex_decides.likely_mistakes.forEach((m) =>
    checkRefs(`Mistake ${m.id}`, m.missing_concept ? [m.missing_concept] : [], true),
  );
  checkRefs("requires_concepts", assessment.stage2_alex_decides.requires_concepts, true);
  checkRefs("tests_concepts", assessment.stage3_curveball.tests_concepts, true);

  // 4. Every concept has a field note AND is tested in the assessment
  const noted = new Set(era.field_notes.map((f) => f.concept_id));
  const tested = new Set([
    ...assessment.stage1_investigate.evidence.flatMap((e) => e.concept_ids),
    ...assessment.stage2_alex_decides.requires_concepts,
    ...assessment.stage2_alex_decides.likely_mistakes.map((m) => m.missing_concept),
    ...assessment.stage3_curveball.tests_concepts,
  ]);
  for (const id of conceptIds) {
    if (!noted.has(id)) errors.push(`Concept ${id} has no field note.`);
    if (!tested.has(id)) errors.push(`Concept ${id} is not tested in the assessment.`);
  }

  // 5. Cast event_ids exist in key_events
  const eventIds = new Set(input.chapter.key_events.map((e) => e.id));
  for (const member of era.cast) {
    if (member.event_ids.length === 0) errors.push(`Cast member ${member.name} has no event_ids.`);
    for (const id of member.event_ids) {
      if (!eventIds.has(id)) errors.push(`Cast member ${member.name} uses unknown event "${id}".`);
    }
  }
  for (const id of era.what_really_happened.event_ids) {
    if (!eventIds.has(id)) errors.push(`what_really_happened uses unknown event "${id}".`);
  }

  // 6. No year in the era that isn't in key_events
  const allowedYears = input.chapter.key_events.map((e) => e.year).join(" ");
  if (!input.chapter.key_events.some((e) => e.year === era.setting.year)) {
    errors.push(`Era year "${era.setting.year}" is not one of the key_events years.`);
  }
  const eraText = [
    ...era.scenes.flatMap((s) => [s.text, ...s.dialogue.map((d) => d.line)]),
    ...era.clues.filter((c) => c.type !== "course_material").map((c) => c.text),
    era.mentor_question.question,
    ...era.mentor_question.hints,
    era.what_really_happened.summary,
  ].join(" ");
  const years = new Set(eraText.match(/\b(1[0-9]{3}|20[0-9]{2})\b/g) ?? []);
  for (const year of years) {
    if (!allowedYears.includes(year)) errors.push(`The era mentions ${year}, which is not in key_events.`);
  }

  // 7. At least one course_material clue with a valid source_id
  const sourceIds = new Set(input.chapter.sources.map((s) => s.id));
  const courseClues = era.clues.filter((c) => c.type === "course_material");
  if (!courseClues.some((c) => c.source_id && sourceIds.has(c.source_id))) {
    errors.push("Needs at least one course_material clue with a valid source_id.");
  }
  for (const c of courseClues) {
    if (!c.source_id || !sourceIds.has(c.source_id)) {
      errors.push(`Clue ${c.id} has an invalid source_id "${c.source_id ?? ""}".`);
    }
  }

  // 8. Exactly 4 scenes, in order
  if (era.scenes.length !== 4) {
    errors.push(`Expected exactly 4 scenes, got ${era.scenes.length}.`);
  } else {
    era.scenes.forEach((s, i) => {
      if (s.n !== i + 1 || s.type !== SCENE_ORDER[i]) {
        errors.push(`Scene ${i + 1} must be n=${i + 1}, type "${SCENE_ORDER[i]}".`);
      }
    });
  }

  // 9. Stage 1 has at least one irrelevant evidence item
  if (!assessment.stage1_investigate.evidence.some((e) => !e.relevant)) {
    errors.push("Stage 1 needs at least one evidence item with relevant: false.");
  }

  // 10. 2–4 likely mistakes, each with a missing_concept
  const mistakes = assessment.stage2_alex_decides.likely_mistakes;
  if (mistakes.length < 2 || mistakes.length > 4) {
    errors.push(`Expected 2–4 likely mistakes, got ${mistakes.length}.`);
  }

  // 11. Scoring adds up to 100
  const s = assessment.scoring;
  if (s.stage1_points + s.stage2_points + s.stage3_points !== 100) {
    errors.push("Scoring stage points must add up to 100.");
  }
  if (s.pass_mark < 0 || s.pass_mark > 100) errors.push("pass_mark must be between 0 and 100.");

  // Integrity checks the time-travel UI relies on
  const clueIds = new Set(era.clues.map((c) => c.id));
  for (const scene of era.scenes) {
    for (const id of scene.clue_ids) {
      if (!clueIds.has(id)) errors.push(`Scene ${scene.n} references unknown clue "${id}".`);
    }
  }
  const mq = era.mentor_question;
  if (mq.scene !== 3) errors.push("mentor_question.scene must be 3.");
  if (mq.key_points.length === 0) errors.push("mentor_question needs key_points.");
  if (mq.hints.length === 0) errors.push("mentor_question needs at least one hint.");
  if (mq.mcq_fallback.options.length < 2) errors.push("mcq_fallback needs at least 2 options.");
  if (mq.mcq_fallback.correct_index < 0 || mq.mcq_fallback.correct_index >= mq.mcq_fallback.options.length) {
    errors.push("mcq_fallback.correct_index is out of range.");
  }

  return errors.length ? { ok: false, errors } : { ok: true, pack };
}
