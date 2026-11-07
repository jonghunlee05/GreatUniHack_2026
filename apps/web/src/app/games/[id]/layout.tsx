import { Suspense } from "react";
import Link from "next/link";
import { loadGame } from "@/lib/load-game";
import { SectionNav } from "@/components/SectionNav";

/** Shared frame for every page inside a game: title + section tabs. */
export default function GameLayout({ children, params }: LayoutProps<"/games/[id]">) {
  return (
    <div className="space-y-8">
      <Suspense fallback={<div className="h-24" />}>
        <GameHeader params={params} />
      </Suspense>
      {children}
    </div>
  );
}

async function GameHeader({ params }: { params: Promise<{ id: string }> }) {
  const game = await loadGame(params);
  return (
    <div className="space-y-4">
      <div>
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← Your games
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{game.title}</h1>
        <p className="mt-1 text-muted">{game.course.name}</p>
      </div>
      <SectionNav gameId={game.id} />
    </div>
  );
}
