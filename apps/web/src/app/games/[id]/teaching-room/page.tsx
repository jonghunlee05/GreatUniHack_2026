import { Suspense } from "react";
import { loadGame } from "@/lib/load-game";
import { TeachingRoomSection } from "@/features/teaching-room/TeachingRoomSection";

// Thin route: loads the game and hands it to the feature component.
export default function Page({ params }: PageProps<"/games/[id]/teaching-room">) {
  return (
    <Suspense fallback={null}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const game = await loadGame(params);
  return <TeachingRoomSection game={game} />;
}
