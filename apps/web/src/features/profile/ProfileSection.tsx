import type { Game } from "@/lib/game-schema";
import { chapterIdFor, type Concept } from "@/lib/chapter-pack";
import { getPack, getPlayState, type AlexConceptKnowledge } from "@/lib/play-state";
import { AlexSprite } from "@/components/pixel/AlexSprite";
import { PixelStar } from "@/components/pixel/PixelStar";

/**
 * Profile (owner: Justin): course progress, stars per chapter, Alex's brain map.
 * Stars and Alex's knowledge are written by the assessment and teaching rooms
 * into the play state (`stars`, `alexBrain`); until then they show as zero / not taught.
 */
export async function ProfileSection({ game }: { game: Game }) {
  const play = await getPlayState(game);
  const chapters = await Promise.all(
    [...game.chapters]
      .sort((a, b) => a.week - b.week)
      .map(async (c) => {
        const id = chapterIdFor(c.week);
        const pack = await getPack(game.id, id);
        return {
          id,
          week: c.week,
          title: c.title,
          state: play.chapters[id]?.state ?? "locked",
          eraFinished: play.timeTravel[id]?.finished ?? false,
          passed: play.chapters[id]?.state === "completed",
          stars: Math.max(0, Math.min(3, play.stars?.[id] ?? 0)),
          concepts: pack?.concepts ?? null,
          brain: play.alexBrain?.[id] ?? {},
        };
      }),
  );

  const n = chapters.length;
  const erasDone = chapters.filter((c) => c.eraFinished).length;
  const passed = chapters.filter((c) => c.passed).length;
  const percent = n ? Math.round(((erasDone + passed) / (2 * n)) * 100) : 0;
  const totalStars = chapters.reduce((s, c) => s + c.stars, 0);

  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-pixel text-lg leading-relaxed text-px-mint">Profile</h2>
        <p className="mt-2 text-xl text-px-muted">Your progress through the course, and what Alex has learned from you.</p>
      </div>

      {/* Course progress */}
      <section aria-labelledby="progress-h" className="px-frame space-y-4 bg-px-ink p-5 [--px-b:var(--px-night)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="progress-h" className="font-pixel text-[0.7rem] text-px-gold">
            Course progress
          </h3>
          <span className="font-pixel text-sm text-px-cream">{percent}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="Course progress"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="px-frame h-6 bg-px-night [--px-b:var(--px-wall-line)]"
        >
          <div
            className="h-full"
            style={{
              width: `${percent}%`,
              background: "repeating-linear-gradient(to right, var(--px-mint) 0 12px, #3fa077 12px 16px)",
            }}
          />
        </div>
        <dl className="grid gap-3 text-xl sm:grid-cols-3">
          <Stat label="Eras explored" value={`${erasDone}/${n}`} />
          <Stat label="Chapters passed" value={`${passed}/${n}`} />
          <Stat label="Stars earned" value={`${totalStars}/${n * 3}`} />
        </dl>
      </section>

      {/* Stars per chapter */}
      <section aria-labelledby="stars-h" className="space-y-4">
        <h3 id="stars-h" className="font-pixel text-[0.7rem] text-px-gold">
          Stars per chapter
        </h3>
        <ul className="space-y-3">
          {chapters.map((c) => (
            <li
              key={c.id}
              className="px-frame flex flex-wrap items-center justify-between gap-3 bg-px-ink px-4 py-3 [--px-b:var(--px-night)]"
            >
              <div className="min-w-0">
                <p className="font-pixel text-[0.55rem] leading-relaxed">
                  Week {c.week} · {c.title}
                </p>
                <p className="text-lg text-px-muted">{statusLabel(c)}</p>
              </div>
              <span className="flex items-center gap-1" aria-label={`${c.stars} of 3 stars`}>
                {[0, 1, 2].map((i) => (
                  <PixelStar
                    key={i}
                    className={`h-6 w-6 ${i < c.stars ? "text-px-gold" : "text-px-wall-line"}`}
                  />
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Alex's brain map */}
      <section aria-labelledby="brain-h" className="space-y-4">
        <div className="flex items-end gap-4">
          <AlexSprite className="h-16 w-auto shrink-0" />
          <div>
            <h3 id="brain-h" className="font-pixel text-[0.7rem] text-px-gold">
              Alex&apos;s brain map
            </h3>
            <p className="mt-1 text-lg text-px-muted">
              Each square is a concept from a chapter. It lights up as you teach Alex.
            </p>
          </div>
        </div>
        <Legend />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {chapters.map((c) => (
            <BrainColumn key={c.id} week={c.week} title={c.title} concepts={c.concepts} brain={c.brain} />
          ))}
        </div>
      </section>
    </div>
  );
}

function statusLabel(c: { state: string; eraFinished: boolean; passed: boolean }): string {
  if (c.passed) return "Assessment passed";
  if (c.eraFinished) return "Era explored · assessment to do";
  if (c.state === "locked") return "Locked";
  if (c.state === "available" || c.state === "failed") return "Era not generated yet";
  return "Era in progress";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-lg text-px-muted">{label}</dt>
      <dd className="font-pixel text-sm text-px-cream">{value}</dd>
    </div>
  );
}

const LEVELS: { label: string; tile: string }[] = [
  { label: "Not taught", tile: "bg-px-night text-px-muted [--px-b:var(--px-wall-line)]" },
  { label: "Heard of it", tile: "bg-[#4a1f1f] text-px-cream [--px-b:var(--px-red)]" },
  { label: "Partly", tile: "bg-[#4a3a12] text-px-cream [--px-b:var(--px-gold)]" },
  { label: "Understood", tile: "bg-[#173d30] text-px-cream [--px-b:var(--px-mint)]" },
];

function Legend() {
  return (
    <ul className="flex flex-wrap gap-4" aria-label="Legend">
      {LEVELS.map((l) => (
        <li key={l.label} className="flex items-center gap-2 text-lg">
          <span className={`px-frame inline-block h-4 w-4 ${l.tile}`} aria-hidden />
          {l.label}
        </li>
      ))}
      <li className="flex items-center gap-2 text-lg">
        <span className="font-pixel text-[0.6rem] text-px-red" aria-hidden>
          !
        </span>
        Misconception
      </li>
    </ul>
  );
}

function BrainColumn({
  week,
  title,
  concepts,
  brain,
}: {
  week: number;
  title: string;
  concepts: Concept[] | null;
  brain: Record<string, AlexConceptKnowledge>;
}) {
  return (
    <div className="px-frame space-y-3 bg-px-ink p-4 [--px-b:var(--px-night)]">
      <p className="font-pixel text-[0.5rem] leading-relaxed text-px-muted">
        Week {week} · {title}
      </p>
      {!concepts ? (
        <p className="text-lg text-px-muted">Generate this era to reveal its concepts.</p>
      ) : (
        <ul className="space-y-2">
          {concepts.map((concept) => {
            const k = brain[concept.id];
            const level = LEVELS[k?.level ?? 0];
            const wrong = k?.misconceptions.length ?? 0;
            return (
              <li
                key={concept.id}
                title={concept.statement}
                aria-label={`${concept.statement}. ${level.label}${wrong ? `, ${wrong} misconception${wrong > 1 ? "s" : ""}` : ""}`}
                className={`px-frame relative p-2 ${level.tile}`}
              >
                <p className="line-clamp-3 text-base leading-snug">{concept.statement}</p>
                <p className="mt-1 font-pixel text-[0.45rem]">{level.label}</p>
                {wrong > 0 && (
                  <span className="absolute right-1 top-1 font-pixel text-[0.6rem] text-px-red" aria-hidden>
                    !
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
