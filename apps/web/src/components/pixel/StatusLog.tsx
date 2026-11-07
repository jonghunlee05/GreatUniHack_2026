"use client";

import { useEffect, useState } from "react";

/**
 * Terminal-style log that reveals one message at a time.
 * The generator doesn't report real stages, so these are friendly messages
 * on a timer; the last one stays until the work finishes.
 */
export function StatusLog({ messages, intervalMs = 4000 }: { messages: string[]; intervalMs?: number }) {
  const [shown, setShown] = useState(1);

  useEffect(() => {
    if (shown >= messages.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), intervalMs);
    return () => clearTimeout(t);
  }, [shown, messages.length, intervalMs]);

  return (
    <ul aria-live="polite" className="px-frame space-y-1 bg-px-night p-4 text-left text-xl [--px-b:var(--px-ink)]">
      {messages.slice(0, shown).map((msg, i) => {
        const current = i === shown - 1;
        return (
          <li key={msg} className={current ? "text-px-mint" : "text-px-muted"}>
            {"> "}
            {msg}
            {current && (
              <span aria-hidden className="anim-blink ml-1">
                ▌
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
