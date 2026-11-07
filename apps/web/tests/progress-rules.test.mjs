// Run: node --experimental-strip-types --test tests/   (from apps/web)
import { test } from "node:test";
import assert from "node:assert/strict";
import { chapterProgress, markProgress } from "../src/features/purple-shared/progress-rules.ts";

const game = { chapters: [1, 2, 3].map((week) => ({ week, title: `Week ${week}` })) };
const fresh = () => ({ progress: {} });

test("only chapter 1 teaching is unlocked at the start", () => {
  const p = chapterProgress(game, fresh());
  assert.deepEqual(p[1], { teachingUnlocked: true, teachingCompleted: false, assessmentUnlocked: false, assessmentCompleted: false });
  assert.equal(p[2].teachingUnlocked, false);
  assert.equal(p[3].assessmentUnlocked, false);
});

test("finishing teaching N unlocks assessment N only", () => {
  const p = chapterProgress(game, markProgress(fresh(), 1, "teachingCompleted"));
  assert.equal(p[1].assessmentUnlocked, true);
  assert.equal(p[2].teachingUnlocked, false);
});

test("passing assessment N unlocks teaching N+1, not assessment N+1", () => {
  let s = markProgress(fresh(), 1, "teachingCompleted");
  s = markProgress(s, 1, "assessmentCompleted");
  const p = chapterProgress(game, s);
  assert.equal(p[1].assessmentCompleted, true);
  assert.equal(p[2].teachingUnlocked, true);
  assert.equal(p[2].assessmentUnlocked, false);
  assert.equal(p[3].teachingUnlocked, false);
});

test("failing keeps the next chapter locked", () => {
  const p = chapterProgress(game, markProgress(fresh(), 1, "teachingCompleted"));
  assert.equal(p[1].assessmentCompleted, false);
  assert.equal(p[2].teachingUnlocked, false);
});

test("an assessment pass without finished teaching can't skip ahead", () => {
  const p = chapterProgress(game, markProgress(fresh(), 1, "assessmentCompleted"));
  assert.equal(p[1].assessmentCompleted, false);
  assert.equal(p[2].teachingUnlocked, false);
});

test("unlocking is idempotent and completed chapters stay reviewable", () => {
  let s = markProgress(fresh(), 1, "teachingCompleted");
  s = markProgress(markProgress(s, 1, "assessmentCompleted"), 1, "assessmentCompleted");
  const again = markProgress(s, 1, "teachingCompleted");
  assert.deepEqual(chapterProgress(game, again), chapterProgress(game, s));
  assert.equal(chapterProgress(game, s)[1].assessmentUnlocked, true); // still enterable after passing
});
