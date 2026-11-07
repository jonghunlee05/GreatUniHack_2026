import { Suspense } from "react";
import { connection } from "next/server";
import { listGames } from "@/lib/storage";
import { AlexSprite } from "@/components/pixel/AlexSprite";
import { Cartridge, InsertSlot } from "@/components/pixel/Cartridge";
import { SpeechBubble } from "@/components/pixel/PixelPanel";

/** Home: the "save file select" screen. */
export default function HomePage() {
  return (
    <div className="space-y-10">
      <header className="flex items-end gap-4">
        <AlexSprite className="h-20 w-auto shrink-0" />
        <div>
          <h1 className="font-pixel text-2xl leading-snug text-px-gold sm:text-3xl">Teach Alex</h1>
          <p className="mt-2 text-xl text-px-muted">Select a save file</p>
        </div>
      </header>

      <Suspense fallback={<p className="font-pixel text-xs text-px-muted">Loading…</p>}>
        <Shelf />
      </Suspense>
    </div>
  );
}

async function Shelf() {
  await connection();
  const games = await listGames();

  return (
    <section aria-label="Your games" className="space-y-8">
      {games.length === 0 && (
        <div className="flex items-center gap-6">
          <AlexSprite mood="idle" className="h-16 w-auto shrink-0" />
          <SpeechBubble>No games yet. Feed me a course!</SpeechBubble>
        </div>
      )}

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {games.map((game) => (
          <ShelfSlot key={game.id}>
            <Cartridge game={game} href={`/games/${game.id}`} />
          </ShelfSlot>
        ))}
        <ShelfSlot>
          <InsertSlot highlight={games.length === 0} />
        </ShelfSlot>
      </ul>
    </section>
  );
}

/** One shelf cell: the item, then a wooden plank (planks join into a shelf). */
function ShelfSlot({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex flex-col justify-end">
      <div className="px-4 pt-8">{children}</div>
      <div aria-hidden className="mt-1 h-4 border-b-4 border-px-wood-dark bg-px-wood" />
    </li>
  );
}
