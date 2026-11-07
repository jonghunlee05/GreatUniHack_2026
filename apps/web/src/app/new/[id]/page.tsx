import { Suspense } from "react";
import { loadGame } from "@/lib/load-game";
import { courseCode, iloCount } from "@/lib/game-display";
import { Machine } from "@/components/pixel/Machine";
import { Cartridge } from "@/components/pixel/Cartridge";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelPanel } from "@/components/pixel/PixelPanel";

/** Reveal: the new cartridge pops out of the machine. */
export default function RevealPage({ params }: PageProps<"/new/[id]">) {
  return (
    <Suspense fallback={null}>
      <Reveal params={params} />
    </Suspense>
  );
}

async function Reveal({ params }: { params: Promise<{ id: string }> }) {
  const game = await loadGame(params);

  return (
    <div className="mx-auto max-w-2xl space-y-8 text-center">
      <h1 className="font-pixel text-lg leading-relaxed text-px-gold sm:text-2xl">New game forged!</h1>

      <div>
        <Machine state="done" className="mx-auto w-56 sm:w-64" />
        <div className="anim-pop relative z-10 mx-auto -mt-12 w-60 text-left">
          <Cartridge game={game} />
        </div>
      </div>

      <PixelPanel className="space-y-2">
        <p className="font-pixel text-xs leading-relaxed text-px-cream sm:text-sm">{game.title}</p>
        <p className="text-xl text-px-muted">{courseCode(game)}</p>
        <p className="text-xl text-px-mint">
          {game.chapters.length} chapters · {iloCount(game)} learning outcomes
        </p>
      </PixelPanel>

      <div className="flex flex-wrap justify-center gap-5">
        <PixelButton href={`/games/${game.id}`} size="lg">
          Enter lobby
        </PixelButton>
        <PixelButton href="/" variant="ghost" size="lg">
          Back to games
        </PixelButton>
      </div>
    </div>
  );
}
