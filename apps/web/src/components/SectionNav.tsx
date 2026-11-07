"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SECTIONS, TONE_CLASSES } from "@/lib/sections";

/** Pixel tab bar shown on every page inside a game. */
export function SectionNav({ gameId }: { gameId: string }) {
  const pathname = usePathname();
  const base = `/games/${gameId}`;

  return (
    <nav aria-label="Game sections" className="flex flex-wrap gap-3">
      <Tab href={base} active={pathname === base} activeInk="text-px-gold">
        Lobby
      </Tab>
      {SECTIONS.map((s) => {
        const href = `${base}/${s.slug}`;
        return (
          <Tab key={s.slug} href={href} active={pathname.startsWith(href)} activeInk={TONE_CLASSES[s.tone].ink}>
            {s.name}
          </Tab>
        );
      })}
    </nav>
  );
}

function Tab({
  href,
  active,
  activeInk,
  children,
}: {
  href: string;
  active: boolean;
  activeInk: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`px-frame m-1 px-3 py-2 font-pixel text-[0.55rem] leading-relaxed ${
        active
          ? `bg-px-ink ${activeInk} [--px-b:currentColor]`
          : "bg-px-wall-line text-px-muted hover:text-px-cream [--px-b:var(--px-ink)]"
      }`}
    >
      {children}
    </Link>
  );
}
