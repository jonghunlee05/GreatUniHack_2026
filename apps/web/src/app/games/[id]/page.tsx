import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGame } from "@/lib/storage";

export default function GamePage({ params }: PageProps<"/games/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading game…</p>}>
      <GameOverview params={params} />
    </Suspense>
  );
}

async function GameOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = await getGame(id);
  if (!game) notFound();

  return (
    <div className="space-y-10">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← Your games
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{game.title}</h1>
        <p className="mt-1 text-muted">
          {game.course.name} · {game.course.level}
        </p>
        <p className="mt-4 max-w-3xl">{game.course.summary}</p>
        <p className="mt-3 text-xs text-muted">
          Generated from {game.sourceFiles.map((f) => f.name).join(", ")}
        </p>
      </div>

      {game.generatorNotes && (
        <div className="rounded-xl border border-line bg-paper px-5 py-4 text-sm">
          <p className="font-medium">Notes from the generator</p>
          <p className="mt-1 text-muted">{game.generatorNotes}</p>
        </div>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Chapters</h2>
        <ol className="space-y-4">
          {game.chapters.map((chapter) => (
            <li key={chapter.week} className="rounded-xl border border-line bg-white p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold">
                  Week {chapter.week} · {chapter.title}
                </h3>
                <span className="rounded-full bg-mint px-3 py-1 text-xs font-medium text-mint-ink">
                  {chapter.era.years} · {chapter.era.name}
                </span>
              </div>
              <p className="mt-2 text-muted">{chapter.summary}</p>
              <p className="mt-3 text-sm">
                <span className="font-medium">Historical problem: </span>
                {chapter.era.problem}
              </p>

              <h4 className="mt-5 text-sm font-semibold uppercase tracking-wide text-muted">
                Learning outcomes
              </h4>
              <ul className="mt-2 space-y-3">
                {chapter.ilos.map((ilo) => (
                  <li key={ilo.id} className="rounded-lg bg-lilac px-4 py-3">
                    <p className="text-sm text-lilac-ink">
                      <span className="font-mono font-semibold">{ilo.id}</span> {ilo.statement}
                    </p>
                    <p className="mt-1 text-xs text-lilac-ink/80">
                      {ilo.bloomLevel} · {ilo.keyConcepts.join(", ")}
                    </p>
                  </li>
                ))}
              </ul>

              {chapter.sourceRefs.length > 0 && (
                <p className="mt-4 text-xs text-muted">
                  Sources:{" "}
                  {chapter.sourceRefs.map((s) => `${s.file} (${s.location})`).join("; ")}
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
