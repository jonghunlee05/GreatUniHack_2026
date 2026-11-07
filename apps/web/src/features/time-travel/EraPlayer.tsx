"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { EraView } from "./progress";
import { SKINS } from "./skins";
import { SceneBackdrop } from "./components/SceneBackdrop";
import { ClueCard, DialogueBox, Logbook, MentorPanel } from "./components/EraParts";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelPanel } from "@/components/pixel/PixelPanel";

const SCENE_LABELS: Record<string, string> = {
  problem: "The problem",
  failed_attempts: "Failed attempts",
  breakthrough: "The breakthrough",
  todays_rule: "Today's rule",
};

type Message = { tone: "good" | "info" | "bad"; text: string } | null;

/**
 * Plays one era: 4 scenes in order. Progress (scene, clues, mentor, finish)
 * is saved on the server after every action, so leaving and returning resumes.
 */
export function EraPlayer({
  gameId,
  chapterId,
  chapterTitle,
  initialView,
}: {
  gameId: string;
  chapterId: string;
  chapterTitle: string;
  initialView: EraView;
}) {
  const [view, setView] = useState(initialView);
  const [viewing, setViewing] = useState(initialView.progress.scene);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mentorMsg, setMentorMsg] = useState<Message>(null);
  const [showTruth, setShowTruth] = useState(initialView.progress.finished);
  const started = useRef(false);

  const base = `/api/games/${gameId}/chapters/${chapterId}`;
  const { era, progress } = view;
  const skin = SKINS[era.setting.skin];
  const scene = era.scenes[viewing - 1];
  const castHere = era.cast.filter((c) => c.scenes.includes(viewing));
  const cluesHere = scene.clue_ids
    .map((id) => era.clues.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const isMentorScene = viewing === 3;
  const atFrontier = viewing === progress.scene;
  const blockedByMentor = isMentorScene && atFrontier && !progress.mentor.passed;

  async function post<T extends EraView>(path: string, body: object): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${base}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return null;
      }
      setView(data as T);
      return data as T;
    } catch {
      setError("Couldn't reach the server. Your progress is saved up to the last step.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  // Mark the era as started (ready → in_progress). Safe to repeat.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetch(`${base}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "start" }),
    }).catch(() => undefined);
  }, [base]);

  async function next() {
    if (viewing < progress.scene) {
      setViewing(viewing + 1);
      return;
    }
    const updated = await post("progress", { type: "advance", scene: viewing + 1 });
    if (updated) setViewing(updated.progress.scene);
  }

  async function answer(body: { answer?: string; mcqIndex?: number }) {
    const res = await post<EraView & { verdict: string; feedback?: string }>("mentor", body);
    if (!res) return;
    if (res.verdict === "correct") {
      setMentorMsg({ tone: "good", text: `${era.mentor.asked_by} nods. That's it. Carry on to today's rule.` });
    } else if (res.verdict === "choose") {
      setMentorMsg({ tone: "info", text: res.feedback ?? "Let's narrow it down. Choose the best answer." });
    } else {
      setMentorMsg({ tone: "bad", text: res.feedback ?? "Not yet. Look at your clues and try again." });
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link href={`/games/${gameId}/time-travel`} className="font-pixel text-[0.6rem] text-px-muted hover:text-px-gold">
          ← Timeline
        </Link>
        <h2 className="font-pixel text-base leading-relaxed text-px-mint">{chapterTitle}</h2>
        <SceneSteps
          scenes={era.scenes.map((s) => SCENE_LABELS[s.type])}
          reached={progress.scene}
          viewing={viewing}
          onSelect={setViewing}
        />
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <SceneBackdrop skin={skin} place={era.setting.place} year={era.setting.year} cast={castHere} />

          <PixelPanel className="space-y-1" tone="cream">
            <p className="font-pixel text-[0.55rem] text-px-copper-dark">
              Scene {scene.n} · {SCENE_LABELS[scene.type]}
            </p>
            <p className="text-xl leading-snug">{scene.text}</p>
          </PixelPanel>

          {scene.dialogue.length > 0 && (
            <div className="space-y-3">
              {scene.dialogue.map((d, i) => (
                <DialogueBox key={i} speaker={d.speaker} line={d.line} skin={skin} />
              ))}
            </div>
          )}

          {cluesHere.length > 0 && (
            <div className="space-y-3">
              <p className="font-pixel text-[0.55rem] text-px-muted">Clues in this scene</p>
              {cluesHere.map((clue) => (
                <ClueCard
                  key={clue.id}
                  clue={clue}
                  collected={progress.collectedClueIds.includes(clue.id)}
                  highlighted={progress.mentor.highlightedClueId === clue.id}
                  sources={view.sources}
                  disabled={busy}
                  onCollect={() => post("progress", { type: "collect", clueId: clue.id })}
                />
              ))}
            </div>
          )}

          {isMentorScene && (
            <MentorPanel
              askedBy={era.mentor.asked_by}
              question={era.mentor.question}
              passed={progress.mentor.passed}
              hints={view.hints}
              mcqOptions={view.mcqOptions}
              message={progress.mentor.passed && !mentorMsg ? { tone: "good", text: "Answered. Well done." } : mentorMsg}
              busy={busy}
              skin={skin}
              onAnswer={(text) => answer({ answer: text })}
              onChoose={(i) => answer({ mcqIndex: i })}
            />
          )}

          {viewing === 4 && (
            <div className="space-y-5">
              {!showTruth ? (
                <PixelButton variant="ghost" onClick={() => setShowTruth(true)}>
                  What really happened?
                </PixelButton>
              ) : (
                <WhatReallyHappened summary={era.what_really_happened.summary} events={view.events} ids={era.what_really_happened.event_ids} />
              )}

              {showTruth && !progress.finished && (
                <PixelButton size="lg" disabled={busy} onClick={() => post("progress", { type: "finish" })}>
                  Finish era
                </PixelButton>
              )}

              {progress.finished && view.fieldNotes && (
                <EraComplete gameId={gameId} notes={view.fieldNotes} />
              )}
            </div>
          )}

          {error && (
            <PixelPanel tone="danger" className="py-3">
              <p role="alert" className="text-lg">
                {error}
              </p>
            </PixelPanel>
          )}

          <div className="flex flex-wrap gap-4">
            {viewing > 1 && (
              <PixelButton variant="ghost" onClick={() => setViewing(viewing - 1)}>
                ← Back
              </PixelButton>
            )}
            {viewing < 4 && (
              <PixelButton onClick={next} disabled={busy || blockedByMentor}>
                {blockedByMentor ? "Answer to continue" : "Next scene →"}
              </PixelButton>
            )}
          </div>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Logbook
            clues={era.clues}
            collectedIds={progress.collectedClueIds}
            highlightedId={progress.mentor.highlightedClueId}
            sources={view.sources}
          />
        </aside>
      </div>
    </div>
  );
}

function SceneSteps({
  scenes,
  reached,
  viewing,
  onSelect,
}: {
  scenes: string[];
  reached: number;
  viewing: number;
  onSelect: (n: number) => void;
}) {
  return (
    <nav aria-label="Scenes" className="flex flex-wrap gap-3">
      {scenes.map((label, i) => {
        const n = i + 1;
        const open = n <= reached;
        return (
          <button
            key={n}
            type="button"
            disabled={!open}
            onClick={() => onSelect(n)}
            aria-current={n === viewing ? "step" : undefined}
            aria-label={`Scene ${n}: ${label}${open ? "" : " (not reached yet)"}`}
            className={`px-frame m-1 px-3 py-2 font-pixel text-[0.5rem] leading-relaxed ${
              n === viewing
                ? "bg-px-ink text-px-gold [--px-b:var(--px-gold)]"
                : open
                  ? "bg-px-wall-line text-px-cream [--px-b:var(--px-ink)]"
                  : "bg-px-night text-px-muted opacity-60 [--px-b:var(--px-ink)]"
            }`}
          >
            {n}. {label}
          </button>
        );
      })}
    </nav>
  );
}

function WhatReallyHappened({
  summary,
  events,
  ids,
}: {
  summary: string;
  events: EraView["events"];
  ids: string[];
}) {
  const used = events.filter((e) => ids.includes(e.id));
  return (
    <section aria-label="What really happened" className="px-frame space-y-3 bg-px-ink p-5 [--px-b:var(--px-blue)]">
      <h3 className="font-pixel text-[0.65rem] text-px-blue">What really happened</h3>
      <p className="text-xl leading-snug">{summary}</p>
      {used.length > 0 && (
        <ul className="space-y-1">
          {used.map((e) => (
            <li key={e.id} className="text-lg text-px-muted">
              <span className="text-px-gold">{e.year}</span> · {e.person}: {e.event}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EraComplete({ gameId, notes }: { gameId: string; notes: NonNullable<EraView["fieldNotes"]> }) {
  return (
    <section aria-label="Era complete" className="px-frame space-y-4 bg-px-ink p-5 [--px-b:var(--px-mint)]">
      <h3 className="font-pixel text-sm leading-relaxed text-px-mint">Era complete!</h3>
      <p className="text-xl">Your field notes are saved. Alex can now be taught this chapter.</p>
      <ul className="space-y-2">
        {notes.map((n) => (
          <li key={n.concept_id} className="text-xl leading-snug">
            ▸ {n.note}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-4">
        <PixelButton href={`/games/${gameId}/teaching-room`}>Go to the teaching room</PixelButton>
        <PixelButton href={`/games/${gameId}/time-travel`} variant="ghost">
          Back to the timeline
        </PixelButton>
      </div>
    </section>
  );
}
