import { Suspense } from "react";
import { loadGame } from "@/lib/load-game";
import { ProfileSection } from "@/features/profile/ProfileSection";

// Thin route: loads the game and hands it to the feature component.
export default function Page({ params }: PageProps<"/games/[id]/profile">) {
  return (
    <Suspense fallback={null}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const game = await loadGame(params);
  return <ProfileSection game={game} />;
}
