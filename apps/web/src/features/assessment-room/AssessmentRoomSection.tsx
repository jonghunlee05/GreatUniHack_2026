"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Game } from "@/lib/game-schema";
import { AlexSprite, type AlexReaction } from "@/components/pixel/AlexSprite";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelPanel } from "@/components/pixel/PixelPanel";
import { chapterKey, type MissionAssist, type MissionDecisionView, type MissionRun } from "@/features/purple-shared/types";
import { usePurpleState } from "@/features/purple-shared/state";
import { ChapterRail, chapterProgress, markProgress } from "@/features/purple-shared/progression";
import "./assessment.css";

const MAX_HINTS = 2;

type Card = { id: string; title: string; detail: string; source_ref: string };
type MissionView = {
  title: string; scenario: string; objective: string; source: "chapter_pack" | "authored" | "demo";
  variant: number; pass_mark: number; weights: Record<string, number>;
  evidence: Card[]; actions: { id: string; label: string }[];
  curveball: { condition: string; evidence: Card[] };
  concepts: { id: string; label: string }[]; hints: Record<string, string>;
};
type Report = {
  decisions: MissionDecisionView[]; components: Record<string, number>; weights: Record<string, number>;
  score: number; pass_mark: number; passed: boolean; stars: number;
  independent_successes: number; assisted_successes: number; prediction_correct: boolean;
  concepts_demonstrated: string[]; concepts_missing: string[]; misconceptions: Record<string, string[]>;
  teaching_evidence: Record<string, string[]>; culprit_concepts: string[]; labels: Record<string, string>;
  reference: string; curveball_reference: string;
  feedback: { failedConcepts: string[]; alexMistake: string; recommendedRevision: string } | null;
};
type Phase = "initial" | "curveball";

const emptyAssist = (): MissionAssist => ({ hints: [], pauses: [] });
function newRun(variant: number): MissionRun {
  return {
    runId: `${Date.now().toString(36)}-${variant}`, variant, stage: "hunt", opened: [], selected: [], prediction: null,
    initialAssist: emptyAssist(), initialDecision: null, curveOpened: [], curveSelected: [], curveAssist: emptyAssist(),
    curveDecision: null, report: null, diagnosis: null,
  };
}

async function callAlex(body: object) {
  try {
    const response = await fetch("/api/alex", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return (await response.json()) as { ok: boolean; error?: string } & Record<string, unknown>;
  } catch {
    return { ok: false, error: "Couldn't reach Mission Control." } as { ok: boolean; error?: string } & Record<string, unknown>;
  }
}

export function AssessmentRoomSection({ game }: { game: Game }) {
  const router = useRouter();
  const { state, update, ready } = usePurpleState(game);
  const chapter = useMemo(() => game.chapters.find((item) => item.week === state.currentChapterWeek) ?? game.chapters[0], [game.chapters, state.currentChapterWeek]);
  const key = chapterKey(chapter.week);
  const progress = chapterProgress(game, state);
  const unlocked = Boolean(progress[chapter.week]?.assessmentUnlocked);
  const run = state.missions?.[key] ?? newRun(0);
  const alexState = state.alexStates?.[key] ?? null;
  const [loaded, setLoaded] = useState<{ key: string; mission: MissionView } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pauseText, setPauseText] = useState("");
  const [openStep, setOpenStep] = useState<number | null>(null);
  const [tool, setTool] = useState<"hint" | "pause" | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const loadKey = `${game.id}:${chapter.week}:${run.variant}`;
  const current = loaded?.key === loadKey ? loaded.mission : null;

  // Load the server-cached mission once per chapter + variant; rerenders don't refetch.
  useEffect(() => {
    if (!ready || !unlocked || loaded?.key === loadKey) return;
    let cancelled = false;
    callAlex({ command: "mission_load", gameId: game.id, chapterWeek: chapter.week, variant: run.variant }).then((r) => {
      if (cancelled) return;
      if (r.ok) { setLoaded({ key: loadKey, mission: r.mission as MissionView }); setError(""); }
      else setError(r.error ?? "Couldn't load the mission.");
    });
    return () => { cancelled = true; };
  }, [ready, unlocked, loaded?.key, loadKey, game.id, chapter.week, run.variant]);

  function save(change: Partial<MissionRun>) {
    update((s) => ({ ...s, missions: { ...(s.missions ?? {}), [key]: { ...(s.missions?.[key] ?? run), ...change } } }));
  }

  function chooseChapter(week: number) {
    if (!progress[week]?.assessmentUnlocked) return; // locked assessments can't be entered
    update((s) => ({ ...s, currentChapterWeek: week }));
    setError(""); setOpenStep(null);
  }

  const base = { gameId: game.id, chapterWeek: chapter.week, alexState, variant: run.variant };
  const hintsUsed = run.initialAssist.hints.length + run.curveAssist.hints.length;
  const phase: Phase = run.stage === "curveball" ? "curveball" : "initial";
  const phaseInputs = (p: Phase) => ({
    phase: p,
    received: p === "initial" ? run.selected : run.curveSelected,
    assist: p === "initial" ? run.initialAssist : run.curveAssist,
    previousAction: run.initialDecision?.action_id,
  });

  async function letAlexDecide() {
    if (pending) return;
    setPending("decide"); setError("");
    const r = await callAlex({ ...base, command: "mission_decide", ...phaseInputs(phase) });
    setPending(null);
    if (!r.ok) return setError(r.error ?? "Alex couldn't decide.");
    const decision = r.decision as MissionDecisionView;
    save(phase === "initial" ? { initialDecision: decision } : { curveDecision: decision });
  }

  async function askWhy() {
    const decision = phase === "initial" ? run.initialDecision : run.curveDecision;
    if (!decision || decision.why || pending) return;
    setPending("why");
    const r = await callAlex({ ...base, command: "mission_why", ...phaseInputs(phase) });
    setPending(null);
    const why = r.ok ? String((r.decision as MissionDecisionView).why ?? decision.explanation) : decision.explanation;
    save(phase === "initial" ? { initialDecision: { ...decision, why } } : { curveDecision: { ...decision, why } });
  }

  function addAssist(change: Partial<MissionAssist>) {
    const field = phase === "initial" ? "initialAssist" : "curveAssist";
    // New help means Alex reconsiders, so any earlier decision in this phase is cleared.
    save({ [field]: { ...run[field], ...change }, [phase === "initial" ? "initialDecision" : "curveDecision"]: null } as Partial<MissionRun>);
  }

  async function finish() {
    if (pending) return;
    setPending("finish"); setError("");
    const r = await callAlex({
      ...base, command: "mission_finish", turnId: run.runId,
      received: run.selected, curveballReceived: run.curveSelected, prediction: run.prediction,
      assist: { initial: run.initialAssist, curveball: run.curveAssist },
    });
    setPending(null);
    if (!r.ok) return setError(r.error ?? "Couldn't score the mission.");
    const report = r.report as Report;
    update((s) => {
      const withRun = { ...s, missions: { ...(s.missions ?? {}), [key]: { ...run, stage: "report" as const, report } } };
      const withFeedback = report.feedback
        ? { ...withRun, assessmentFeedback: { ...(s.assessmentFeedback ?? {}), [key]: report.feedback } }
        : withRun;
      // Idempotent: marking an already-passed chapter again changes nothing.
      return report.passed ? markProgress(withFeedback, chapter.week, "assessmentCompleted") : withFeedback;
    });
  }

  function reteach() {
    const report = run.report as Report | null;
    const target = report?.feedback?.failedConcepts[0] ?? report?.concepts_missing[0] ?? null;
    update((s) => ({ ...s, repairTarget: target }));
    router.push(`/games/${game.id}/teaching-room`);
  }

  if (!ready) return <PixelPanel><p>Loading Mission Control...</p></PixelPanel>;
  const rail = <ChapterRail game={game} state={state} mode="assessment" currentWeek={chapter.week} onSelect={chooseChapter} />;
  if (!unlocked) {
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
  if (!current) {
    return <div className="space-y-6">{rail}<PixelPanel>{error ? <p className="text-px-red">{error}</p> : <p className="anim-blink">Loading mission…</p>}</PixelPanel></div>;
  }

  const labels = Object.fromEntries(current.concepts.map((c) => [c.id, c.label]));
  const decision = phase === "curveball" ? run.curveDecision : run.initialDecision;
  const assistNow = phase === "initial" ? run.initialAssist : run.curveAssist;
  const report = run.stage === "report" ? (run.report as Report | null) : null;
  const pose = POSES[run.stage];
  const mood: AlexReaction = pending ? "thinking"
    : report ? (report.passed ? "got_it" : "understanding")
    : decision ? (decision.success ? "got_it" : "confused")
    : run.stage === "curveball" ? "confused" : run.stage === "decide" ? "thinking" : "curious";
  const speech = pending === "why" ? "Let me put my reasoning into words…"
    : pending ? "Hmm… weighing what you sent me…"
    : report ? (report.passed ? "We did it! I'll remember what worked." : "I see where I slipped. Can you teach me that part again?")
    : decision ? (decision.why ?? decision.explanation)
    : run.stage === "hunt" ? "I'll only know what you send me. Pick the evidence that really matters!"
    : run.stage === "curveball" ? "Wait… something changed? Show me the new information."
    : "I've got the evidence. Help me, or let me decide on my own.";

  function sendCard(id: string, lane: "initial" | "curveball") {
    if (lane === "initial") save({ selected: run.selected.includes(id) ? run.selected.filter((x) => x !== id) : [...run.selected, id] });
    else save({ curveSelected: run.curveSelected.includes(id) ? run.curveSelected.filter((x) => x !== id) : [...run.curveSelected, id], curveDecision: null });
    setLastAdded(id);
  }

  const inventoryCards = run.stage === "curveball" ? [...current.evidence, ...current.curveball.evidence] : current.evidence;
  const inventoryIds = run.stage === "curveball" ? [...run.selected, ...run.curveSelected] : run.selected;

  return (
    <div className="space-y-5">
      {rail}

      {/* Briefing bar */}
      <PixelPanel className="[--px-b:var(--px-violet)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="font-pixel text-[0.55rem] text-px-violet">MISSION CONTROL · WEEK {chapter.week}{current.variant ? ` · VARIANT ${current.variant}` : ""}</p>
            <h2 className="mt-2 font-pixel text-sm leading-relaxed text-px-cream">{current.title}</h2>
            <details className="mt-1"><summary className="cursor-pointer text-px-muted">Briefing</summary><p className="mt-2 max-w-3xl text-xl">{current.scenario}</p></details>
          </div>
          <div className="bg-px-night p-3 text-right">
            <p className="font-pixel text-[0.5rem] text-px-muted">OBJECTIVE</p>
            <p className="max-w-xs text-px-gold">{current.objective || "Help Alex reach a justified decision."}</p>
            <p className={`mt-1 font-pixel text-[0.45rem] ${current.source === "demo" ? "text-px-red" : "text-px-mint"}`}>
              {current.source === "chapter_pack" ? "FROM CHAPTER PACK" : current.source === "authored" ? "AUTHORED MISSION" : "DEMO MISSION"}
            </p>
          </div>
        </div>
      </PixelPanel>

      <StageRail stage={run.stage} />
      {error && <p className="text-px-red" role="alert">{error}</p>}

      {/* Mission area: Alex | stage | controls */}
      <div className={`grid gap-5 ${report ? "lg:grid-cols-[13rem_minmax(0,1fr)]" : "lg:grid-cols-[13rem_minmax(0,1fr)_17rem]"}`}>
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <PixelPanel className="text-center [--px-b:var(--px-violet)]">
            <p className={`font-pixel text-[0.5rem] ${pose.color}`}>{pose.label}</p>
            <div className={`${run.stage === "decide" ? "ar-alexDeciding" : run.stage === "curveball" ? "ar-alexSurprised" : run.stage === "report" ? "ar-alexReflective" : ""}`}>
              <AlexSprite key={run.stage} mood={mood} className={`mx-auto mt-2 w-24 ${run.stage === "curveball" && !run.curveDecision ? "ar-shake" : ""}`} label={`Alex is ${pose.label.toLowerCase()}`} />
            </div>
            <p className="font-pixel text-[0.6rem] text-px-violet">ALEX</p>
          </PixelPanel>
          <div className="relative mt-4 border-4 border-px-ink bg-px-cream p-3 text-lg leading-snug text-px-ink" aria-live="polite">
            <span aria-hidden className="absolute -top-3 left-8 h-3 w-4 bg-px-cream" style={{ clipPath: "polygon(50% 0, 100% 100%, 0 100%)" }} />
            {speech}
          </div>
          {run.prediction && run.stage !== "report" && (
            <p className="mt-3 inline-block bg-px-night px-2 py-1 font-pixel text-[0.5rem] text-px-gold">🔮 YOU PREDICT: {labels[run.prediction]}</p>
          )}
        </aside>

        <main key={run.stage} className={`min-w-0 ar-enter`}>
          {run.stage === "hunt" && (
            <section className="space-y-3">
              <p className="font-pixel text-[0.6rem] text-px-violet">EVIDENCE LANE · flip a file, then send what matters to Alex →</p>
              <EvidenceLane cards={current.evidence} opened={run.opened} selected={run.selected}
                onOpen={(id) => save({ opened: [...new Set([...run.opened, id])] })} onSend={(id) => sendCard(id, "initial")} />
            </section>
          )}

          {run.stage === "decide" && (
            <DecisionArea actions={current.actions} decision={run.initialDecision} pending={pending === "decide"} />
          )}

          {run.stage === "curveball" && (
            <section className="space-y-4">
              <div className={`px-frame bg-px-night p-4 text-center [--px-b:var(--px-red)] ar-alarm`}>
                <p className="font-pixel text-sm">⚠ CURVEBALL · THE SITUATION CHANGED</p>
                <p className="mt-2 text-xl">{current.curveball.condition}</p>
              </div>
              <div className="grid items-stretch gap-3 md:grid-cols-[minmax(0,10rem)_auto_minmax(0,1fr)_auto_minmax(0,10rem)]">
                <FlowStep title="OLD PLAN" tone={run.initialDecision?.success ? "mint" : "red"}>{run.initialDecision?.action_label ?? "—"}</FlowStep>
                <Arrow />
                <div className="min-w-0">
                  <p className="mb-2 font-pixel text-[0.5rem] text-px-gold">NEW EVIDENCE · send it so Alex can react</p>
                  <EvidenceLane compact cards={current.curveball.evidence} opened={run.curveOpened} selected={run.curveSelected}
                    onOpen={(id) => save({ curveOpened: [...new Set([...run.curveOpened, id])] })} onSend={(id) => sendCard(id, "curveball")} />
                </div>
                <Arrow />
                <FlowStep title="ALEX RECONSIDERS" tone={run.curveDecision ? (run.curveDecision.success ? "mint" : "red") : "violet"}>
                  {pending === "decide" ? <span className="anim-blink">thinking…</span> : run.curveDecision ? run.curveDecision.action_label : "Waiting for your call"}
                </FlowStep>
              </div>
              {run.curveDecision && <Consequence decision={run.curveDecision} />}
            </section>
          )}

          {report && (
            <ReportBoard report={report} run={run} labels={labels} openStep={openStep} setOpenStep={setOpenStep}
              onDiagnose={(id) => save({ diagnosis: id })} onReteach={reteach}
              onRetry={() => update((s) => ({ ...s, missions: { ...(s.missions ?? {}), [key]: newRun(run.variant + 1) } }))}
              nextWeek={game.chapters[game.chapters.findIndex((c) => c.week === chapter.week) + 1]?.week}
              onNext={(week) => { update((s) => ({ ...s, currentChapterWeek: week, repairTarget: null })); router.push(`/games/${game.id}/teaching-room`); }} />
          )}
        </main>

        {!report && (
          <aside className="space-y-4">
            {run.stage === "hunt" ? (
              <PixelPanel>
                <p className="font-pixel text-[0.5rem] text-px-gold">🔮 WHERE MIGHT ALEX SLIP?</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {current.concepts.map((c) => (
                    <button key={c.id} type="button" onClick={() => save({ prediction: run.prediction === c.id ? null : c.id })} aria-pressed={run.prediction === c.id}
                      className={`border-2 px-2 py-1 text-left text-lg transition-colors ${run.prediction === c.id ? "border-px-gold bg-px-gold text-px-ink" : "border-px-wall-line hover:border-px-gold"}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </PixelPanel>
            ) : (
              <PixelPanel className="[--px-b:var(--px-copper)]">
                <div className="flex items-center justify-between">
                  <p className="font-pixel text-[0.5rem] text-px-gold">MENTOR CONTROLS</p>
                  <span className="flex gap-1" aria-label={`${hintsUsed} of ${MAX_HINTS} hints used`}>
                    {Array.from({ length: MAX_HINTS }, (_, i) => <span key={i} className={`h-3 w-3 ${i < hintsUsed ? "bg-px-wall-line" : "bg-px-gold"}`} />)}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <ControlButton icon="▶" label="Let Alex decide" primary disabled={!!pending || !!decision} onClick={letAlexDecide} />
                  <ControlButton icon="?" label={pending === "why" ? "Explaining…" : "Ask why"} disabled={!decision || !!pending || !!decision?.why} onClick={askWhy} />
                  <ControlButton icon="💡" label="Give hint" active={tool === "hint"} disabled={hintsUsed >= MAX_HINTS} onClick={() => setTool(tool === "hint" ? null : "hint")} />
                  <ControlButton icon="⏸" label="Pause & explain" active={tool === "pause"} onClick={() => setTool(tool === "pause" ? null : "pause")} />
                </div>
                {tool === "hint" && (
                  <div className={`mt-3 space-y-2 ar-enter`}>
                    <p className="text-px-muted">Hint about which idea?</p>
                    {Object.keys(current.hints).map((id) => (
                      <button key={id} type="button" disabled={assistNow.hints.includes(id) || hintsUsed >= MAX_HINTS}
                        onClick={() => { addAssist({ hints: [...assistNow.hints, id] }); setTool(null); }}
                        className="block w-full border-2 border-px-wall-line px-2 py-1 text-left text-lg hover:border-px-gold disabled:opacity-40">
                        💡 {labels[id] ?? id}
                      </button>
                    ))}
                  </div>
                )}
                {tool === "pause" && (
                  <div className={`mt-3 space-y-2 ar-enter`}>
                    <textarea value={pauseText} onChange={(e) => setPauseText(e.target.value)} className="px-input px-frame min-h-16" placeholder="Teach Alex one more idea…" />
                    <PixelButton className="w-full" disabled={!pauseText.trim()} onClick={() => { addAssist({ pauses: [...assistNow.pauses, pauseText.trim()] }); setPauseText(""); setTool(null); }}>Explain to Alex</PixelButton>
                  </div>
                )}
                {(assistNow.hints.length > 0 || assistNow.pauses.length > 0) && (
                  <ul className="mt-3 space-y-1 border-t-2 border-px-wall-line pt-2 text-lg">
                    {assistNow.hints.map((id) => <li key={id} className="text-px-gold">💡 {current.hints[id]}</li>)}
                    {assistNow.pauses.map((t, i) => <li key={i} className="text-px-muted">⏸ “{t}”</li>)}
                    <li className="font-pixel text-[0.45rem] text-px-violet">HELP GIVEN → SUCCESS COUNTS AS ASSISTED</li>
                  </ul>
                )}
              </PixelPanel>
            )}

            <PixelPanel className="[--px-b:var(--px-gold)]">
              <p className={`font-pixel text-[0.5rem] text-px-gold ${lastAdded ? "ar-bump" : ""}`} key={`count-${inventoryIds.length}`}>🎒 MISSION INVENTORY · {inventoryIds.length}</p>
              {inventoryIds.length === 0 ? <p className="mt-2 text-px-muted">Empty. Alex only sees what you put here.</p> : (
                <ul className="mt-2 space-y-1">
                  {inventoryCards.filter((c) => inventoryIds.includes(c.id)).map((c) => (
                    <li key={c.id} className={`flex items-center justify-between gap-2 bg-px-night px-2 py-1 text-lg ${c.id === lastAdded ? "ar-flyIn" : ""}`}>
                      <span>📄 {c.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </PixelPanel>

            {run.stage === "hunt" && <PixelButton size="lg" className="w-full" disabled={run.selected.length === 0} onClick={() => save({ stage: "decide" })}>Hand to Alex →</PixelButton>}
            {run.stage === "decide" && run.initialDecision && <PixelButton size="lg" className="w-full" onClick={() => { setTool(null); save({ stage: "curveball" }); }}>Next → Curveball</PixelButton>}
            {run.stage === "curveball" && run.curveDecision && <PixelButton size="lg" className="w-full" disabled={pending === "finish"} onClick={finish}>{pending === "finish" ? "Scoring…" : "Finish → Report"}</PixelButton>}
          </aside>
        )}
      </div>
    </div>
  );
}

const POSES: Record<MissionRun["stage"], { label: string; color: string }> = {
  hunt: { label: "OBSERVING", color: "text-px-blue" },
  decide: { label: "DECIDING", color: "text-px-gold" },
  curveball: { label: "SURPRISED!", color: "text-px-red" },
  report: { label: "REFLECTING", color: "text-px-mint" },
};

const STAGES: { id: MissionRun["stage"]; label: string; icon: string }[] = [
  { id: "hunt", label: "EVIDENCE HUNT", icon: "🔍" },
  { id: "decide", label: "ALEX DECIDES", icon: "🧠" },
  { id: "curveball", label: "CURVEBALL", icon: "⚠" },
  { id: "report", label: "REPORT", icon: "★" },
];

function StageRail({ stage }: { stage: MissionRun["stage"] }) {
  const index = STAGES.findIndex((s) => s.id === stage);
  return (
    <ol className="flex items-center gap-1 overflow-x-auto" aria-label="Mission stages">
      {STAGES.map((s, i) => (
        <li key={s.id} className="flex min-w-0 flex-1 items-center gap-1" aria-current={i === index ? "step" : undefined}>
          <div className={`px-frame flex min-w-[8.5rem] flex-1 items-center gap-2 px-3 py-2 font-pixel text-[0.5rem] transition-colors ${
            i === index ? `bg-px-gold text-px-ink [--px-b:var(--px-gold-dark)] ar-stageActive` : i < index ? "bg-px-ink text-px-mint [--px-b:var(--px-mint)]" : "bg-px-night text-px-muted [--px-b:var(--px-wall-line)]"
          }`}>
            <span className="text-base">{i < index ? "✓" : s.icon}</span>{i + 1}. {s.label}
          </div>
          {i < STAGES.length - 1 && <span className={`font-pixel text-xs ${i < index ? "text-px-mint" : "text-px-wall-line"}`}>▶</span>}
        </li>
      ))}
    </ol>
  );
}

function EvidenceLane({ cards, opened, selected, onOpen, onSend, compact = false }: {
  cards: Card[]; opened: string[]; selected: string[]; onOpen: (id: string) => void; onSend: (id: string) => void; compact?: boolean;
}) {
  return (
    <div className={`flex gap-4 overflow-x-auto pb-3 ar-lane`}>
      {cards.map((card, i) => {
        const isOpen = opened.includes(card.id);
        const isSent = selected.includes(card.id);
        return (
          <div key={card.id} className={`ar-card ${isOpen ? "ar-flipped" : ""} ${compact ? "w-56" : "w-60"} shrink-0`}>
            <div className="ar-cardInner">
              {/* front: closed file */}
              <div className="ar-face">
              <button type="button" onClick={() => onOpen(card.id)} aria-label={`Inspect ${card.title}`} tabIndex={isOpen ? -1 : 0}
                className="px-frame flex h-full w-full flex-col items-center justify-center gap-3 bg-px-ink p-4 text-center [--px-b:var(--px-wall-line)] hover:[--px-b:var(--px-violet)]">
                <span className={`ar-cardPattern flex h-20 w-16 items-center justify-center border-4 border-px-wall-line font-pixel text-xl text-px-gold`}>?</span>
                <span className="font-pixel text-[0.55rem] leading-relaxed">FILE {String(i + 1).padStart(2, "0")}</span>
                <span className="text-lg">{card.title}</span>
                <span className="font-pixel text-[0.45rem] text-px-muted">CLICK TO FLIP</span>
              </button>
              </div>
              {/* back: details */}
              <div className={`ar-face ar-back`}>
              <div className={`px-frame flex h-full flex-col gap-2 overflow-y-auto bg-px-ink p-4 ${isSent ? `[--px-b:var(--px-gold)] ar-sent` : "[--px-b:var(--px-violet)]"}`}>
                <p className="font-pixel text-[0.55rem] leading-relaxed">📂 {card.title}</p>
                <p className="text-lg leading-snug">{card.detail}</p>
                <p className="text-px-muted">Source: {card.source_ref}</p>
                <div className="mt-auto">
                  <PixelButton variant={isSent ? "ghost" : "copper"} className="w-full" onClick={() => onSend(card.id)} aria-pressed={isSent} tabIndex={isOpen ? 0 : -1}>
                    {isSent ? "✓ In inventory · undo" : "Send to Alex →"}
                  </PixelButton>
                </div>
              </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DecisionArea({ actions, decision, pending }: { actions: { id: string; label: string }[]; decision: MissionDecisionView | null; pending: boolean }) {
  return (
    <section className="space-y-4">
      <p className="font-pixel text-[0.6rem] text-px-violet">{decision ? "ALEX HAS CHOSEN" : pending ? "ALEX IS WEIGHING HIS OPTIONS…" : "ALEX'S OPTIONS · help him, or let him decide"}</p>
      <div className={`flex gap-3 overflow-x-auto pb-3 ar-lane`}>
        {actions.map((a, i) => {
          const chosen = decision?.action_id === a.id;
          return (
            <div key={a.id} className={`px-frame flex w-52 shrink-0 flex-col gap-2 p-4 transition-opacity ${
              chosen ? `${decision!.success ? "bg-px-mint text-px-ink [--px-b:var(--px-mint)]" : "bg-px-red text-px-ink [--px-b:var(--px-red)]"} ar-chosen`
                : decision ? "bg-px-night opacity-40 [--px-b:var(--px-wall-line)]"
                : `bg-px-ink [--px-b:var(--px-wall-line)] ${pending ? "anim-blink" : ""}`
            }`}>
              <span className="font-pixel text-[0.5rem]">OPTION {String.fromCharCode(65 + i)}{chosen ? " · CHOSEN" : ""}</span>
              <span className="text-lg leading-snug">{a.label}</span>
            </div>
          );
        })}
      </div>
      {decision && <Consequence decision={decision} />}
    </section>
  );
}

function Consequence({ decision }: { decision: MissionDecisionView }) {
  return (
    <div className={`px-frame flex flex-wrap items-center gap-4 bg-px-night p-4 ${decision.success ? "[--px-b:var(--px-mint)]" : "[--px-b:var(--px-red)]"} ar-enter`}>
      <span className={`font-pixel text-2xl ${decision.success ? "text-px-mint" : "text-px-red"}`}>{decision.success ? "✓" : "✗"}</span>
      <div className="min-w-0 flex-1">
        <p className="font-pixel text-[0.55rem]">{decision.success ? "IT WORKS" : "GAP EXPOSED"}</p>
        <p className="mt-1 text-lg">{decision.consequence}</p>
      </div>
      <SoloBadge decision={decision} />
    </div>
  );
}

function SoloBadge({ decision }: { decision: MissionDecisionView }) {
  if (!decision.success) return <span className="bg-px-wall-line px-2 py-1 font-pixel text-[0.5rem] text-px-muted">NO POINTS</span>;
  return decision.assisted
    ? <span className="bg-px-violet px-2 py-1 font-pixel text-[0.5rem] text-px-ink">🤝 ASSISTED · HALF</span>
    : <span className="bg-px-gold px-2 py-1 font-pixel text-[0.5rem] text-px-ink">★ SOLO · FULL</span>;
}

function FlowStep({ title, tone, children }: { title: string; tone: "mint" | "red" | "violet"; children: React.ReactNode }) {
  const frame = tone === "mint" ? "[--px-b:var(--px-mint)]" : tone === "red" ? "[--px-b:var(--px-red)]" : "[--px-b:var(--px-violet)]";
  return (
    <div className={`px-frame flex flex-col gap-2 bg-px-ink p-3 ${frame}`}>
      <p className="font-pixel text-[0.5rem] text-px-muted">{title}</p>
      <p className="text-lg leading-snug">{children}</p>
    </div>
  );
}

function Arrow() {
  return <span aria-hidden className="hidden self-center font-pixel text-lg text-px-gold md:block">▶</span>;
}

type EvidenceReview = { relevant_sent: string[]; irrelevant_sent: string[]; relevant_missed: string[]; curveball_seen: boolean };

function ReportBoard({ report, run, labels, openStep, setOpenStep, onDiagnose, onReteach, onRetry, nextWeek, onNext }: {
  report: Report; run: MissionRun; labels: Record<string, string>; openStep: number | null; setOpenStep: (i: number | null) => void;
  onDiagnose: (id: string) => void; onReteach: () => void; onRetry: () => void; nextWeek?: number; onNext: (week: number) => void;
}) {
  const name = (id: string) => report.labels[id] ?? labels[id] ?? id;
  const culprits = report.culprit_concepts;
  const review = (report as Report & { evidence_review?: EvidenceReview }).evidence_review;
  const parts: [string, string][] = [["evidence", "Evidence"], ["decision", "Decision"], ["curveball", "Curveball"]];
  return (
    <section className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* 1 Result */}
        <BoardColumn n={1} title="RESULT" tone={report.passed ? "mint" : "red"}>
          <p className="font-pixel text-3xl text-px-gold">{report.score}<span className="text-base text-px-cream"> /100</span></p>
          <p className="text-2xl">{"★".repeat(report.stars)}{"☆".repeat(3 - report.stars)}</p>
          <p className={`font-pixel text-[0.55rem] ${report.passed ? "text-px-mint" : "text-px-red"}`}>{report.passed ? "MISSION PASSED" : `NOT YET · NEED ${report.pass_mark}`}</p>
          <div className="space-y-2">
            {parts.map(([id, label]) => (
              <div key={id}>
                <div className="flex justify-between text-lg"><span>{label}</span><span>{report.components[id]}/{report.weights[id]}</span></div>
                <div className="h-2 bg-px-night"><div className="h-full bg-px-violet" style={{ width: `${(100 * report.components[id]) / Math.max(1, report.weights[id])}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {report.decisions.map((d) => <SoloBadge key={d.phase} decision={d} />)}
          </div>
        </BoardColumn>

        {/* 2 Where Alex slipped */}
        <BoardColumn n={2} title="WHERE ALEX SLIPPED" tone={culprits.length ? "red" : "mint"}>
          {report.decisions.map((d, i) => (
            <button key={d.phase} type="button" onClick={() => setOpenStep(openStep === i ? null : i)} aria-expanded={openStep === i}
              className={`w-full border-l-4 bg-px-night p-2 text-left ${d.success ? "border-px-mint" : "border-px-red"}`}>
              <p className="font-pixel text-[0.45rem] text-px-muted">{d.phase === "initial" ? "FIRST DECISION" : "AFTER CURVEBALL"} {openStep === i ? "▲" : "▼"}</p>
              <p className="text-lg leading-snug">{d.success ? "✓" : "✗"} {d.action_label}</p>
              {openStep === i && <p className="mt-1 text-px-muted">“{d.explanation}” → {d.consequence}</p>}
            </button>
          ))}
          {culprits.length > 0 && <p className="text-px-red">Gap: {culprits.map(name).join(", ")}</p>}
          {Object.entries(report.misconceptions).map(([id, list]) => <p key={id} className="text-px-red">⚠ {name(id)}: {list.at(-1)}</p>)}
          <p className={report.prediction_correct ? "text-px-mint" : "text-px-muted"}>🔮 Your prediction: {run.prediction ? `${name(run.prediction)} ${report.prediction_correct ? "✓" : "✗"}` : "none"}</p>
        </BoardColumn>

        {/* 3 Evidence */}
        <BoardColumn n={3} title="WHAT EVIDENCE MATTERED" tone="violet">
          {review ? (
            <>
              {review.relevant_sent.map((t) => <p key={t} className="text-px-mint">✓ {t}</p>)}
              {review.relevant_missed.map((t) => <p key={t} className="text-px-gold">… missed: {t}</p>)}
              {review.irrelevant_sent.map((t) => <p key={t} className="text-px-red">✗ distraction: {t}</p>)}
              <p className={review.curveball_seen ? "text-px-mint" : "text-px-red"}>{review.curveball_seen ? "✓ Showed Alex the new condition" : "✗ Alex never saw the new condition"}</p>
            </>
          ) : <p className="text-px-muted">Evidence score {report.components.evidence}/{report.weights.evidence}.</p>}
          {Object.entries(report.teaching_evidence).filter(([, q]) => q.length).slice(0, 2).map(([id, quotes]) => (
            <p key={id} className="border-l-4 border-px-wall-line pl-2 text-px-muted">You taught {name(id)}: “{quotes.at(-1)}”</p>
          ))}
        </BoardColumn>

        {/* 4 Next */}
        <BoardColumn n={4} title={report.passed ? "WHAT'S NEXT" : "RE-TEACH & RETRY"} tone="gold">
          {report.passed ? (
            <>
              <p>{nextWeek ? `Week ${nextWeek} teaching is unlocked.` : "Final chapter complete!"}</p>
              {nextWeek && <PixelButton size="lg" className="w-full" onClick={() => onNext(nextWeek)}>Teach Week {nextWeek} →</PixelButton>}
            </>
          ) : (
            <>
              <p>{report.feedback?.recommendedRevision}.</p>
              <PixelButton size="lg" className="w-full" onClick={onReteach}>📚 Re-teach Alex</PixelButton>
            </>
          )}
          <PixelButton variant="ghost" className="w-full" onClick={onRetry}>🔁 {report.passed ? "Replay" : "Retry"} new variant</PixelButton>
          {report.passed && <PixelButton variant="ghost" className="w-full" onClick={onReteach}>Back to Teaching Room</PixelButton>}
        </BoardColumn>
      </div>

      <PixelPanel>
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-pixel text-[0.6rem] text-px-violet">🕵 KNOWLEDGE DETECTIVE</p>
          <p>{culprits.length ? "Which concept caused Alex's mistake?" : "No mistakes. Which concept carried the mission?"}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.keys(report.labels).map((id) => (
            <PixelButton key={id} variant={run.diagnosis === id ? "copper" : "ghost"} onClick={() => onDiagnose(id)} disabled={!!run.diagnosis}>{name(id)}</PixelButton>
          ))}
        </div>
        {run.diagnosis && (
          <p className={`mt-3 ${culprits.length === 0 || culprits.includes(run.diagnosis) ? "text-px-mint" : "text-px-red"} ar-enter`}>
            {culprits.length === 0 ? "Nice, every tested concept held up." : culprits.includes(run.diagnosis) ? "Correct! That gap is exactly what tripped Alex up." : `Not quite. The gap was in ${culprits.map(name).join(", ")}.`}
          </p>
        )}
        <details className="mt-3"><summary className="cursor-pointer text-px-muted">Show the reference answer</summary><p className="mt-2">{report.reference}</p><p className="mt-1 text-px-muted">After the curveball: {report.curveball_reference}</p></details>
      </PixelPanel>
    </section>
  );
}

function BoardColumn({ n, title, tone, children }: { n: number; title: string; tone: "mint" | "red" | "violet" | "gold"; children: React.ReactNode }) {
  const frame = { mint: "[--px-b:var(--px-mint)]", red: "[--px-b:var(--px-red)]", violet: "[--px-b:var(--px-violet)]", gold: "[--px-b:var(--px-gold)]" }[tone];
  return (
    <div className={`px-frame flex flex-col gap-3 bg-px-ink p-4 ${frame} ar-enter`} style={{ animationDelay: `${n * 80}ms` }}>
      <p className="font-pixel text-[0.5rem] text-px-muted">{n} · {title}</p>
      {children}
    </div>
  );
}

function ControlButton({ icon, label, onClick, disabled, primary, active }: {
  icon: string; label: string; onClick: () => void; disabled?: boolean; primary?: boolean; active?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active}
      className={`px-frame flex flex-col items-center gap-1 p-3 text-center transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 ${
        primary ? "col-span-2 bg-px-copper text-px-ink [--px-b:var(--px-copper-dark)]" : active ? "bg-px-gold text-px-ink [--px-b:var(--px-gold-dark)]" : "bg-px-night [--px-b:var(--px-wall-line)]"
      }`}>
      <span className="text-xl">{icon}</span>
      <span className="font-pixel text-[0.5rem] leading-relaxed">{label.toUpperCase()}</span>
    </button>
  );
}
