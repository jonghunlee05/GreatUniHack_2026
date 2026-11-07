"use client";

import type { Game } from "@/lib/game-schema";
import { usePurpleState } from "@/features/purple-shared/state";
import { chapterKey } from "@/features/purple-shared/types";

// Same level names as the teaching room's "Alex's brain" panel.
const LEVELS: { label: string; tile: string }[] = [
  { label: "Not learned", tile: "bg-px-night text-px-muted [--px-b:var(--px-wall-line)]" },
  { label: "Recognised", tile: "bg-[#4a1f1f] text-px-cream [--px-b:var(--px-red)]" },
  { label: "Understood", tile: "bg-[#4a3a12] text-px-cream [--px-b:var(--px-gold)]" },
  { label: "Applied", tile: "bg-[#173d30] text-px-cream [--px-b:var(--px-mint)]" },
];

/**
 * Alex's brain map, read from the teaching room's own saved state (the same brain
 * the teaching room's "Alex's brain" panel shows), so it updates as soon as you teach Alex.
 * `weakSpots` are concept statements a time ripple left shaky in each chapter's era.
 */
export function BrainMap({ game, weakSpots }: { game: Game; weakSpots: Record<number, string[]> }) {
  const { state, ready } = usePurpleState(game);
  if (!ready) return <p className="text-lg text-px-muted">Loading Alex&apos;s brain…</p>;

  const chapters = [...game.chapters].sort((a, b) => a.week - b.week);
  return (
    <div className="space-y-4">
      <ul className="flex flex-wrap gap-4" aria-label="Legend">
        {LEVELS.map((l) => (
          <li key={l.label} className="flex items-center gap-2 text-lg">
            <span className={`px-frame inline-block h-4 w-4 ${l.tile}`} aria-hidden />
            {l.label}
          </li>
        ))}
        <li className="flex items-center gap-2 text-lg">
          <span className="font-pixel text-[0.6rem] text-px-red" aria-hidden>!</span>
          Misconception
        </li>
      </ul>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {chapters.map((chapter) => {
          const concepts = Object.values(state.brains[chapterKey(chapter.week)]?.concepts ?? {});
          const taught = concepts.filter((c) => c.level > 0).length;
          const weak = weakSpots[chapter.week] ?? [];
          return (
            <div key={chapter.week} className="px-frame space-y-3 bg-px-ink p-4 [--px-b:var(--px-night)]">
              <div>
                <p className="font-pixel text-[0.5rem] leading-relaxed text-px-muted">
                  Week {chapter.week} · {chapter.title}
                </p>
                <p className="mt-1 text-base text-px-violet">
                  {taught}/{concepts.length} concepts taught
                </p>
              </div>
              <ul className="space-y-2">
                {concepts.map((c) => {
                  const level = LEVELS[c.level] ?? LEVELS[0];
                  const wrong = c.misconceptions.length;
                  return (
                    <li
                      key={c.conceptId}
                      title={c.misconceptions.at(-1) ?? c.evidence.at(-1) ?? c.label}
                      aria-label={`${c.label}: ${level.label}${wrong ? `, ${wrong} misconception${wrong > 1 ? "s" : ""}` : ""}`}
                      className={`px-frame relative p-2 ${level.tile}`}
                    >
                      <p className="text-base leading-snug">{c.label}</p>
                      <p className="mt-1 font-pixel text-[0.45rem]">{level.label}</p>
                      {wrong > 0 && (
                        <span className="absolute right-1 top-1 font-pixel text-[0.6rem] text-px-red" aria-hidden>!</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {weak.length > 0 && (
                <div className="border-l-4 border-px-violet pl-2">
                  <p className="font-pixel text-[0.45rem] text-px-violet">≈ WEAK SPOTS FROM TIME-TRAVEL</p>
                  {weak.map((w) => (
                    <p key={w} className="text-base leading-snug text-px-muted">• {w}</p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
