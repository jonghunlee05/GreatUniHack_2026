import { Suspense } from "react";
import Link from "next/link";
import { loadGame } from "@/lib/load-game";
import { SECTIONS, TONE_CLASSES } from "@/lib/sections";

/** Game hub: the four sections from the app-flow diagram. */
export default function GameHubPage({ params }: PageProps<"/games/[id]">) {
  return (
    <Suspense fallback={null}>
      <SectionGrid params={params} />
    </Suspense>
  );
}

async function SectionGrid({ params }: { params: Promise<{ id: string }> }) {
  const game = await loadGame(params);

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {SECTIONS.map((s) => {
        const tone = TONE_CLASSES[s.tone];
        return (
          <li key={s.slug}>
            <Link
              href={`/games/${game.id}/${s.slug}`}
              className={`flex h-40 flex-col items-center justify-center rounded-2xl border text-center transition ${tone.card}`}
            >
              <span className={`text-2xl font-semibold ${tone.ink}`}>{s.name}</span>
              <span className={`mt-1 ${tone.ink} opacity-80`}>{s.tagline}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
