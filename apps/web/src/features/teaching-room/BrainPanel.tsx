"use client";

import { useState } from "react";
import type { BrainState, KnowledgeLevel } from "@/features/purple-shared/types";

const LEVELS = ["Not learned", "Recognised", "Understood", "Applied"];

function LevelPips({ level }: { level: KnowledgeLevel }) {
  return (
    <span className="flex gap-1" aria-label={`${LEVELS[level]}, level ${level} of 3`}>
      {[1, 2, 3].map((pip) => (
        <span key={pip} className={`h-2.5 w-4 ${pip <= level ? "bg-px-violet" : "bg-px-wall-line"}`} />
      ))}
    </span>
  );
}

/**
 * Alex's brain: brain-sync bar plus one compact row per concept.
 * Click a row for the evidence (your words), misconceptions and what's still missing.
 */
export function BrainPanel({
  brain,
  progress,
  repairTarget,
  openAll,
}: {
  brain: BrainState;
  progress: number;
  repairTarget: string | null;
  openAll: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const pct = Math.round(progress * 100);

  return (
    <section aria-label="Alex's brain" className="px-frame space-y-4 bg-px-ink p-4 [--px-b:var(--px-violet)]">
      <div>
        <div className="flex items-baseline justify-between">
          <h2 className="font-pixel text-[0.6rem] text-px-violet">ALEX&apos;S BRAIN</h2>
          <span className="font-pixel text-[0.55rem] text-px-cream">{pct}%</span>
        </div>
        <div className="mt-2 h-3 bg-px-night" aria-label={`Alex learning progress ${pct}%`}>
          <div className="h-full bg-px-violet" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <ul className="space-y-2">
        {Object.values(brain.concepts).map((concept) => {
          const isOpen = openAll || open === concept.conceptId;
          return (
            <li
              key={concept.conceptId}
              data-testid={`card-${concept.conceptId}`}
              className={`border-l-4 pl-2 ${repairTarget === concept.conceptId ? "border-px-gold" : concept.misconceptions.length ? "border-px-red" : "border-px-wall-line"}`}
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : concept.conceptId)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <span className="text-lg leading-snug">{concept.label}</span>
                <LevelPips level={concept.level} />
              </button>
              {concept.misconceptions.length > 0 && !isOpen && (
                <p className="text-base text-px-red">⚠ {concept.misconceptions.at(-1)}</p>
              )}
              {isOpen && (
                <div className="mt-2 space-y-2 text-base">
                  <p className="font-pixel text-[0.45rem] text-px-muted">{LEVELS[concept.level].toUpperCase()}</p>
                  {concept.evidence.length > 0 ? (
                    <div>
                      <p className="font-pixel text-[0.45rem] text-px-mint">YOUR WORDS</p>
                      {concept.evidence.slice(-3).map((quote) => (
                        <p key={quote} className="border-l-4 border-px-mint pl-2">
                          “{quote}”
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-px-muted">No teaching evidence yet.</p>
                  )}
                  {concept.misconceptions.length > 0 && (
                    <div>
                      <p className="font-pixel text-[0.45rem] text-px-red">MISCONCEPTIONS</p>
                      {concept.misconceptions.map((m) => (
                        <p key={m}>• {m}</p>
                      ))}
                    </div>
                  )}
                  {concept.missingPoints.length > 0 && (
                    <div>
                      <p className="font-pixel text-[0.45rem] text-px-gold">STILL MISSING</p>
                      {concept.missingPoints.map((m) => (
                        <p key={m}>• {m}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
