import { Suspense } from "react";
import Link from "next/link";
import { loadGame } from "@/lib/load-game";
import { chapterIdFor } from "@/lib/chapter-pack";
import { getPlayState } from "@/lib/play-state";
import { buildEraView } from "@/features/time-travel/progress";
import { EraPlayer } from "@/features/time-travel/EraPlayer";

// Thin route: loads the game, checks the chapter is playable, hands the era to the player.
export default function EraPage({ params }: PageProps<"/games/[id]/time-travel/[chapterId]">) {
  return (
    <Suspense fallback={null}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ id: string; chapterId: string }> }) {
  const { chapterId } = await params;
  const game = await loadGame(params);
  const chapter = game.chapters.find((c) => chapterIdFor(c.week) === chapterId);
  const play = await getPlayState(game);
  const state = play.chapters[chapterId]?.state;

  if (!chapter || !state || !["ready", "in_progress", "completed"].includes(state)) {
    return (
      <div className="space-y-4">
        <p className="text-xl">This era isn&apos;t open yet. Generate it from the timeline first.</p>
        <Link href={`/games/${game.id}/time-travel`} className="font-pixel text-[0.6rem] text-px-gold">
          ← Back to the timeline
        </Link>
      </div>
    );
  }

  const view = await buildEraView(game, chapterId, play);
  return (
    <EraPlayer
      gameId={game.id}
      chapterId={chapterId}
      chapterTitle={`Week ${chapter.week} · ${chapter.title}`}
      initialView={view}
    />
  );
}
