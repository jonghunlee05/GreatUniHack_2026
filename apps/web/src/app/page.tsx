import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { listGames } from "@/lib/storage";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your games</h1>
          <p className="mt-1 text-muted">
            One game per course. Upload your materials and Alex is ready to learn.
          </p>
        </div>
        <Link
          href="/new"
          className="rounded-lg bg-mint-ink px-4 py-2 font-medium text-white hover:opacity-90"
        >
          + New game
        </Link>
      </div>

      <Suspense fallback={<p className="text-muted">Loading games…</p>}>
        <GameList />
      </Suspense>
    </div>
  );
}

async function GameList() {
  await connection();
  const games = await listGames();

  if (games.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-paper p-10 text-center">
        <p className="font-medium">No games yet</p>
        <p className="mt-1 text-muted">
          Start by uploading course materials: PDFs, slides or notes.
        </p>
        <Link href="/new" className="mt-4 inline-block font-medium text-mint-ink underline">
          Create your first game
        </Link>
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {games.map((game) => (
        <li key={game.id}>
          <Link
            href={`/games/${game.id}`}
            className="block h-full rounded-xl border border-line bg-paper p-5 transition hover:border-mint-ink"
          >
            <p className="font-semibold">{game.title}</p>
            <p className="mt-1 text-sm text-muted">{game.course.name}</p>
            <p className="mt-3 text-sm">
              {game.chapters.length} chapters ·{" "}
              {game.chapters.reduce((n, c) => n + c.ilos.length, 0)} learning outcomes
            </p>
            <p className="mt-1 text-xs text-muted">
              Created {new Date(game.createdAt).toLocaleDateString("en-GB")}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
