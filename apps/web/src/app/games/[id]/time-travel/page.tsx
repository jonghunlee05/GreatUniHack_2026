import { Suspense } from "react";
import { loadGame } from "@/lib/load-game";
import { TimeTravelSection } from "@/features/time-travel/TimeTravelSection";

// Thin route: loads the game and hands it to the feature component.
export default function Page({ params }: PageProps<"/games/[id]/time-travel">) {
  return (
    <Suspense fallback={null}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const game = await loadGame(params);
  return <TimeTravelSection game={game} />;
}
