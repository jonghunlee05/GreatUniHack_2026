import { Suspense } from "react";
import Link from "next/link";
import { loadGame } from "@/lib/load-game";
import { SectionNav } from "@/components/SectionNav";

/** Shared frame for every page inside a game: title + station tabs. */
export default function GameLayout({ children, params }: LayoutProps<"/games/[id]">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<div className="h-28" />}>
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
      <Link href="/" className="font-pixel text-[0.6rem] text-px-muted hover:text-px-gold">
        ← Games
      </Link>
      <div>
        <h1 className="font-pixel text-base leading-relaxed text-px-cream sm:text-lg">{game.title}</h1>
        <p className="mt-1 text-xl text-px-muted">{game.course.name}</p>
      </div>
      <SectionNav gameId={game.id} />
    </div>
  );
}
