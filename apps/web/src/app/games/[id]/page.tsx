import { Suspense } from "react";
import { loadGame } from "@/lib/load-game";
import { gameProgress } from "@/lib/game-display";
import { LobbyScene } from "@/features/lobby/LobbyScene";

/** Game lobby: the pixel room with the four stations. */
export default function GameLobbyPage({ params }: PageProps<"/games/[id]">) {
  return (
    <Suspense fallback={null}>
      <Lobby params={params} />
    </Suspense>
  );
}

async function Lobby({ params }: { params: Promise<{ id: string }> }) {
  const game = await loadGame(params);
  const progress = gameProgress(game);
  const firstEra = game.chapters[0]?.era.years ?? "";
  const subject = game.course.name || game.course.subject;

  return (
    <div className="space-y-4">
      <LobbyScene
        gameId={game.id}
        hudLabel={firstEra ? `${subject} · ${firstEra}` : subject}
        stars={progress.stars}
        maxStars={progress.maxStars}
        progress={game.chapters.length ? progress.completedChapters / game.chapters.length : 0}
        currentWeek={progress.currentWeek}
      />
      <p className="text-center text-xl text-px-muted">Pick a station. Tab and Enter work too.</p>
    </div>
  );
}
