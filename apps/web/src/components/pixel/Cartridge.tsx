import Link from "next/link";
import type { Game } from "@/lib/game-schema";
import { courseCode, formatDate, gameProgress } from "@/lib/game-display";
import { PixelStar } from "./PixelStar";

/**
 * A game shown as a pixel cartridge.
 * With `href` it's a link that lifts 4px on hover; without, it's static (reveal screen).
 */
export function Cartridge({ game, href }: { game: Game; href?: string }) {
  const progress = gameProgress(game);
  const body = (
    <div className="lift px-frame relative bg-px-steel-light p-3 pt-6 group-hover:-translate-y-1 group-focus-visible:-translate-y-1">
      {/* grip ridges */}
      <div
        aria-hidden
        className="absolute left-3 right-3 top-2 h-2"
        style={{ background: "repeating-linear-gradient(to right, var(--px-steel) 0 8px, transparent 8px 12px)" }}
      />
      <div className="px-frame min-h-[7.5rem] bg-px-cream p-3 text-px-ink [--px-b:var(--px-ink)] group-hover:[--px-b:var(--px-copper)] group-focus-visible:[--px-b:var(--px-copper)]">
        <p className="line-clamp-3 font-pixel text-[0.6rem] leading-relaxed">{game.title}</p>
        <p className="mt-2 truncate text-lg leading-tight text-px-wood">{courseCode(game)}</p>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-px-ink">
        <Pips total={game.chapters.length} filled={progress.completedChapters} />
        <span className="flex items-center gap-1.5 font-pixel text-[0.6rem]">
          <PixelStar className="h-3 w-3 text-px-copper-dark" />
          {progress.stars}/{progress.maxStars}
        </span>
      </div>
      <p className="mt-1 text-base text-px-ink/80">Created {formatDate(game.createdAt)}</p>
    </div>
  );

  if (!href) return body;
  return (
    <Link
      href={href}
      aria-label={`Open ${game.title}, ${game.chapters.length} chapters, ${progress.stars} of ${progress.maxStars} stars`}
      className="group block focus-visible:outline-none"
    >
      {body}
    </Link>
  );
}

/** One square per chapter; filled = completed. */
function Pips({ total, filled }: { total: number; filled: number }) {
  return (
    <span className="flex flex-wrap gap-1" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-2.5 w-2.5 border-2 border-px-ink ${i < filled ? "bg-px-mint" : "bg-transparent"}`}
        />
      ))}
    </span>
  );
}

/** Empty shelf slot that starts the New game flow. */
export function InsertSlot({ highlight = false }: { highlight?: boolean }) {
  return (
    <Link
      href="/new"
      aria-label="Insert new game: upload course materials"
      className="group block focus-visible:outline-none"
    >
      <div
        className={`lift flex min-h-[15rem] flex-col items-center justify-center gap-3 border-4 border-dashed p-4 text-center group-hover:-translate-y-1 group-hover:border-px-copper group-hover:text-px-copper group-focus-visible:border-px-gold ${
          highlight ? "anim-glow border-px-gold text-px-gold" : "border-px-muted text-px-muted"
        }`}
      >
        <span className="font-pixel text-3xl">+</span>
        <span className="font-pixel text-[0.6rem] leading-relaxed">Insert new game</span>
      </div>
    </Link>
  );
}
