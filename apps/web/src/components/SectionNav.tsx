"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SECTIONS, TONE_CLASSES } from "@/lib/sections";

/** Tab bar shown on every page inside a game. */
export function SectionNav({ gameId }: { gameId: string }) {
  const pathname = usePathname();
  const base = `/games/${gameId}`;

  return (
    <nav className="flex gap-2 overflow-x-auto border-b border-line pb-px">
      <NavLink href={base} active={pathname === base} activeClass="border-foreground">
        Overview
      </NavLink>
      {SECTIONS.map((s) => {
        const href = `${base}/${s.slug}`;
        const tone = TONE_CLASSES[s.tone];
        return (
          <NavLink
            key={s.slug}
            href={href}
            active={pathname.startsWith(href)}
            activeClass={`${tone.ink} border-current`}
          >
            {s.name}
          </NavLink>
        );
      })}
    </nav>
  );
}

function NavLink({
  href,
  active,
  activeClass,
  children,
}: {
  href: string;
  active: boolean;
  activeClass: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
        active ? activeClass : "border-transparent text-muted hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
