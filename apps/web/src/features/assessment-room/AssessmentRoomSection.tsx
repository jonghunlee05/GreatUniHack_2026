"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Game } from "@/lib/game-schema";
import { AlexSprite } from "@/components/pixel/AlexSprite";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelPanel, SpeechBubble } from "@/components/pixel/PixelPanel";
import { conceptForRepair, decide, makeMission, scoreAttempt } from "@/features/purple-shared/engine";
import { chapterKey, initialAttempt } from "@/features/purple-shared/types";
import { usePurpleState } from "@/features/purple-shared/state";
import { ChapterRail, PASS_SCORE, chapterProgress, markProgress } from "@/features/purple-shared/progression";

const SCORE_LABELS: Record<string, [string, number]> = {
  teaching: ["Teaching accuracy", 30], independent: ["Independent performance", 30],
  transfer: ["Knowledge transfer", 15], evidence: ["Evidence selection", 10], diagnosis: ["Diagnosis", 15],
};

export function AssessmentRoomSection({ game }: { game: Game }) {
  const router = useRouter();
  const { state, update, ready } = usePurpleState(game);
  const chapter = useMemo(() => game.chapters.find((item) => item.week === state.currentChapterWeek) ?? game.chapters[0], [game.chapters, state.currentChapterWeek]);
  const key = chapterKey(chapter.week);
  const brain = state.brains[key];
  const attempt = state.attempts[key] ?? initialAttempt(chapter);
  const task = useMemo(() => makeMission(chapter, attempt.rematch), [chapter, attempt.rematch]);
  const [why, setWhy] = useState(false);
  const [intervention, setIntervention] = useState("");
  const currentPhase = attempt.phase === "curveball" ? "curveball" : "initial";
  const currentDecision = attempt.decisions.find((item) => item.phase === currentPhase);
  const previousAttempt = state.previousAttempts.filter((item) => item.chapterWeek === chapter.week).at(-1);

  function save(next: typeof attempt) {
    update((current) => ({ ...current, attempts: { ...current.attempts, [key]: next } }));
  }

  function toggleEvidence(id: string) {
    const inspected = attempt.inspectedEvidence.includes(id) ? attempt.inspectedEvidence : [...attempt.inspectedEvidence, id];
    const selected = attempt.selectedEvidence.includes(id) ? attempt.selectedEvidence.filter((item) => item !== id) : [...attempt.selectedEvidence, id];
    save({ ...attempt, inspectedEvidence: inspected, selectedEvidence: selected });
  }

  function runDecision(phase: "initial" | "curveball") {
    const assisted = attempt.hintsUsed > 0 || attempt.interventions.length > 0;
    const result = decide(brain, task, attempt.selectedEvidence, phase, assisted);
    save({ ...attempt, decisions: [...attempt.decisions.filter((item) => item.phase !== phase), result] });
  }

  const progress = chapterProgress(game, state);
  const nextChapter = game.chapters[game.chapters.findIndex((item) => item.week === chapter.week) + 1];

  function finish() {
    const scored = scoreAttempt(brain, task, attempt);
    const done = { ...attempt, phase: "report" as const, completed: true, score: scored.total, scoreParts: scored.parts };
    update((current) => {
      const saved = { ...current, attempts: { ...current.attempts, [key]: done } };
      // Passing unlocks the next teaching chapter (Agent 3 never decides this).
      return scored.total >= PASS_SCORE ? markProgress(saved, chapter.week, "assessmentCompleted") : saved;
    });
  }

  function chooseChapter(week: number) {
    if (!progress[week]?.assessmentUnlocked) return;
    update((current) => ({ ...current, currentChapterWeek: week }));
  }

  function repair(conceptId: string) {
    update((current) => ({ ...current, repairTarget: conceptId }));
    router.push(`/games/${game.id}/teaching-room`);
  }

  function rematch() {
    const next = initialAttempt(chapter, attempt.rematch + 1);
    update((current) => ({ ...current, previousAttempts: [...current.previousAttempts, attempt], attempts: { ...current.attempts, [key]: next } }));
  }

  if (!ready) return <PixelPanel><p>Loading Mission Control...</p></PixelPanel>;

  const rail = <ChapterRail game={game} state={state} mode="assessment" currentWeek={chapter.week} onSelect={chooseChapter} />;
  if (!progress[chapter.week]?.assessmentUnlocked) {
    return (
      <div className="space-y-6">
        {rail}
        <PixelPanel tone="danger">
          <p className="font-pixel text-[0.65rem]">🔒 ASSESSMENT LOCKED</p>
          <p className="mt-2">Finish teaching Week {chapter.week} first, then Mission Control opens.</p>
          <PixelButton className="mt-4" onClick={() => router.push(`/games/${game.id}/teaching-room`)}>Back to Teaching Room</PixelButton>
        </PixelPanel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {rail}
      <PixelPanel className="[--px-b:var(--px-violet)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="font-pixel text-[0.6rem] text-px-violet">MISSION CONTROL · WEEK {chapter.week}</p><h2 className="mt-3 font-pixel text-sm leading-relaxed text-px-cream">{task.title}</h2><p className="mt-3 max-w-3xl text-2xl">{task.scenario}</p></div>
          <div className="bg-px-night p-4 text-right"><p className="font-pixel text-[0.55rem] text-px-muted">OBJECTIVE</p><p className="mt-2 max-w-sm text-px-gold">{task.objective}</p></div>
        </div>
      </PixelPanel>

      {attempt.phase === "evidence" && (
        <section className="space-y-5">
          <div><p className="font-pixel text-[0.65rem] text-px-violet">PHASE A · EVIDENCE HUNT</p><p className="mt-2 text-px-muted">Inspect cards and send only useful evidence to Alex.</p></div>
          <div className="grid gap-4 md:grid-cols-2">
            {task.evidence.map((card) => {
              const selected = attempt.selectedEvidence.includes(card.id);
              return <button key={card.id} type="button" onClick={() => toggleEvidence(card.id)} className="text-left"><PixelPanel className={selected ? "h-full [--px-b:var(--px-gold)]" : "h-full [--px-b:var(--px-wall-line)]"}><div className="flex justify-between gap-3"><p className="font-pixel text-[0.65rem]">{card.title}</p><span>{selected ? "✓ SENT" : "OPEN"}</span></div><p className="mt-3 text-xl">{card.detail}</p><p className="mt-3 text-px-muted">Source: {card.source}</p></PixelPanel></button>;
            })}
          </div>
          <PixelButton size="lg" disabled={attempt.selectedEvidence.length === 0} onClick={() => save({ ...attempt, phase: "decision" })}>Transmit evidence →</PixelButton>
        </section>
      )}

      {(attempt.phase === "decision" || attempt.phase === "curveball") && (
        <section className="grid gap-6 lg:grid-cols-[1fr_16rem]">
          <div className="space-y-5">
            <p className="font-pixel text-[0.65rem] text-px-violet">{attempt.phase === "decision" ? "PHASE B · ALEX'S DECISION" : "PHASE C · CURVEBALL"}</p>
            {attempt.phase === "curveball" && <PixelPanel tone="danger"><p className="text-2xl">{task.curveball}</p></PixelPanel>}
            <div className="grid items-end gap-5 sm:grid-cols-[8rem_1fr]"><AlexSprite mood={currentDecision?.success === false ? "worried" : "reading"} className="w-28" label="Alex deciding" /><SpeechBubble>{currentDecision?.reasoning ?? "I am checking the evidence against only what you taught me."}</SpeechBubble></div>
            {!currentDecision ? <PixelButton size="lg" onClick={() => runDecision(currentPhase)}>Let Alex decide</PixelButton> : <PixelPanel tone={currentDecision.success ? "cream" : "danger"}><p className="font-pixel text-[0.65rem]">{currentDecision.success ? "MISSION RESULT: SUCCESS" : "MISSION RESULT: GAP EXPOSED"}</p><p className="mt-3 text-2xl">{currentDecision.consequence}</p><p className="mt-2">{currentDecision.assisted ? "Assisted run" : "Independent run"}</p></PixelPanel>}
            {currentDecision && attempt.phase === "decision" && <PixelButton onClick={() => save({ ...attempt, phase: "curveball" })}>Continue to curveball →</PixelButton>}
            {currentDecision && attempt.phase === "curveball" && <div className="space-y-3"><label className="font-pixel text-[0.6rem] text-px-violet" htmlFor="diagnosis">KNOWLEDGE DETECTIVE</label><select id="diagnosis" className="px-input px-frame" value={attempt.diagnosis ?? ""} onChange={(event) => save({ ...attempt, diagnosis: event.target.value })}><option value="">Which concept explains the outcome?</option>{Object.values(brain.concepts).map((concept) => <option key={concept.conceptId} value={concept.conceptId}>{concept.label}</option>)}</select><PixelButton size="lg" disabled={!attempt.diagnosis} onClick={finish}>Complete mission → Report</PixelButton></div>}
          </div>

          <aside className="space-y-4">
            <PixelPanel><p className="font-pixel text-[0.55rem] text-px-muted">MENTOR CONTROLS</p><div className="mt-4 space-y-3"><PixelButton variant="ghost" className="w-full" onClick={() => setWhy((value) => !value)}>Ask why</PixelButton><PixelButton variant="ghost" className="w-full" disabled={attempt.hintsUsed >= 1} onClick={() => save({ ...attempt, hintsUsed: 1 })}>Hint {attempt.hintsUsed}/1</PixelButton></div>{why && <p className="mt-4 text-px-gold">Alex can use only stored knowledge and transmitted evidence.</p>}</PixelPanel>
            <PixelPanel><label htmlFor="intervention" className="font-pixel text-[0.55rem]">PAUSE & EXPLAIN</label><textarea id="intervention" className="px-input px-frame mt-3 min-h-24" value={intervention} onChange={(event) => setIntervention(event.target.value)} placeholder="One conceptual hint..." /><PixelButton variant="ghost" className="mt-3 w-full" disabled={!intervention.trim()} onClick={() => { save({ ...attempt, interventions: [...attempt.interventions, intervention.trim()] }); setIntervention(""); }}>Send intervention</PixelButton></PixelPanel>
          </aside>
        </section>
      )}

      {attempt.phase === "report" && attempt.score !== null && (
        <section className="space-y-6">
          {attempt.score >= PASS_SCORE ? (
            <PixelPanel className="[--px-b:var(--px-mint)]">
              <p className="font-pixel text-[0.65rem] text-px-mint">★ CHAPTER PASSED</p>
              <p className="mt-2">{nextChapter ? `Teaching for Week ${nextChapter.week} is now unlocked.` : "That was the final chapter. Course complete!"}</p>
              {nextChapter && (
                <PixelButton className="mt-4" onClick={() => { update((current) => ({ ...current, currentChapterWeek: nextChapter.week, repairTarget: null })); router.push(`/games/${game.id}/teaching-room`); }}>
                  Teach Week {nextChapter.week} →
                </PixelButton>
              )}
            </PixelPanel>
          ) : (
            <PixelPanel tone="danger">
              <p className="font-pixel text-[0.65rem]">NOT PASSED YET</p>
              <p className="mt-2">Score {PASS_SCORE}+ to unlock the next chapter. Repair a knowledge card or try a rematch.</p>
            </PixelPanel>
          )}
          <div className="grid gap-5 md:grid-cols-[15rem_1fr]">
            <PixelPanel className="text-center [--px-b:var(--px-gold)]"><p className="font-pixel text-[0.65rem] text-px-muted">FINAL SCORE</p><p className="mt-5 font-pixel text-4xl text-px-gold">{attempt.score}</p><p className="mt-2 text-2xl">/ 100</p><p className="mt-4 text-3xl">{"★".repeat(attempt.score >= 85 ? 3 : attempt.score >= 65 ? 2 : attempt.score >= 40 ? 1 : 0)}{"☆".repeat(attempt.score >= 85 ? 0 : attempt.score >= 65 ? 1 : attempt.score >= 40 ? 2 : 3)}</p></PixelPanel>
            <PixelPanel><p className="font-pixel text-[0.65rem] text-px-violet">TRANSPARENT SCORING</p><div className="mt-5 space-y-4">{Object.entries(attempt.scoreParts).map(([id, value]) => { const [label, max] = SCORE_LABELS[id]; return <div key={id}><div className="flex justify-between"><span>{label}</span><span>{value}/{max}</span></div><div className="mt-1 h-3 bg-px-night"><div className="h-full bg-px-violet" style={{ width: `${100 * value / max}%` }} /></div></div>; })}</div></PixelPanel>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <PixelPanel><p className="font-pixel text-[0.65rem]">DECISION REPLAY</p><div className="mt-4 space-y-4">{attempt.decisions.map((decision) => <div key={decision.phase} className="bg-px-night p-3"><p className="text-px-violet">{decision.phase.toUpperCase()} · {decision.success ? "SUCCESS" : "GAP"}</p><p className="mt-2">{decision.reasoning}</p><p className="text-px-muted">{decision.assisted ? "Assisted" : "Independent"}</p></div>)}</div></PixelPanel>
            <PixelPanel><p className="font-pixel text-[0.65rem]">KNOWLEDGE CARDS</p><div className="mt-4 space-y-4">{Object.values(brain.concepts).map((concept) => <div key={concept.conceptId} className="bg-px-night p-3"><div className="flex justify-between"><strong>{concept.label}</strong><span>{concept.level}/3</span></div>{concept.evidence.at(-1) && <p className="mt-2 text-px-muted">“{concept.evidence.at(-1)}”</p>}{(concept.level < 2 || concept.misconceptions.length > 0) && <PixelButton variant="ghost" className="mt-3" onClick={() => repair(concept.conceptId)}>Repair</PixelButton>}</div>)}</div></PixelPanel>
          </div>
          <PixelPanel>
            <p className="font-pixel text-[0.65rem] text-px-violet">WHY THIS ANSWER</p>
            <p className="mt-3 text-2xl">{task.explanation}</p>
            {previousAttempt?.score !== null && previousAttempt?.score !== undefined && (
              <p className="mt-4 text-px-gold">Before / after: {previousAttempt.score} → {attempt.score}. Independent successes are kept separate from assisted runs.</p>
            )}
          </PixelPanel>
          <PixelPanel tone="cream"><p>This is a simulated learning character. Alex&apos;s performance is formative feedback, not scientific proof of human learning.</p></PixelPanel>
          <div className="flex flex-wrap gap-3"><PixelButton onClick={() => repair(conceptForRepair(brain) ?? Object.keys(brain.concepts)[0])}>Repair weakest concept</PixelButton><PixelButton variant="ghost" onClick={rematch}>Changed rematch</PixelButton></div>
        </section>
      )}
    </div>
  );
}
