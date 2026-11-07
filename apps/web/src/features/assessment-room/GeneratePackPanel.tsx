"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { chapterIdFor } from "@/lib/chapter-pack";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelPanel } from "@/components/pixel/PixelPanel";

type State = "locked" | "available" | "generating" | "ready" | "in_progress" | "completed" | "failed";
const HAS_PACK = new Set<State>(["ready", "in_progress", "completed"]);

/**
 * Shown when this week's chapter pack doesn't exist yet. Same rule and endpoint as the
 * Time-travel timeline: Generate is only allowed from "available" / "failed" (checked on the
 * server), runs Agent 2 once, and the pack (era + mission) is saved for good.
 */
export function GeneratePackPanel({ gameId, week, onReady }: { gameId: string; week: number; onReady: () => void }) {
  const chapterId = chapterIdFor(week);
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Read the chapter's state; keep polling while it's generating (e.g. started from Time-travel).
  useEffect(() => {
    let stop = false;
    const check = async () => {
      const res = await fetch(`/api/games/${gameId}/chapters`).catch(() => null);
      if (!res?.ok || stop) return;
      const { chapters } = (await res.json()) as { chapters: Record<string, { state: State; error?: string }> };
      const s = chapters[chapterId]?.state ?? "locked";
      setState(s);
      setError(chapters[chapterId]?.error ?? null);
      if (HAS_PACK.has(s)) onReady();
    };
    void check();
    const t = setInterval(() => {
      if (state === "generating") void check();
    }, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [gameId, chapterId, state, onReady]);

  async function generate() {
    setState("generating");
    setError(null);
    try {
      const res = await fetch(`/api/games/${gameId}/chapters/${chapterId}/generate`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { state?: State; error?: string };
      if (data.state === "ready") return onReady();
      setState(data.state ?? "failed");
      setError(data.error ?? "Generation failed.");
    } catch {
      setState("failed");
      setError("Couldn't reach the server.");
    }
  }

  if (state === null) return <PixelPanel><p className="anim-blink">Checking this week&apos;s chapter…</p></PixelPanel>;

  return (
    <PixelPanel className="space-y-4 [--px-b:var(--px-violet)]">
      <p className="font-pixel text-[0.65rem] text-px-violet">WEEK {week} MISSION NOT GENERATED YET</p>
      {state === "locked" ? (
        <>
          <p className="text-xl">This chapter is still locked. Finish the previous week&apos;s era in Time-travel first.</p>
          <PixelButton href={`/games/${gameId}/time-travel`} variant="ghost">Go to Time-travel</PixelButton>
        </>
      ) : state === "generating" ? (
        <>
          <p className="text-xl">Generating this week&apos;s era and mission… this takes about a minute and a half.</p>
          <PixelButton disabled><span className="anim-blink">Generating…</span></PixelButton>
        </>
      ) : (
        <>
          <p className="text-xl">
            Missions are built from the chapter pack, the same one that creates this week&apos;s time-travel era. Generate
            it once and both are ready.
          </p>
          {state === "failed" && error && <p role="alert" className="text-lg text-px-red">{error}</p>}
          <div className="flex flex-wrap gap-4">
            <PixelButton onClick={generate}>{state === "failed" ? "Try again" : "Generate"}</PixelButton>
            <Link href={`/games/${gameId}/time-travel`} className="self-center font-pixel text-[0.55rem] text-px-muted hover:text-px-gold">
              or open Time-travel →
            </Link>
          </div>
        </>
      )}
    </PixelPanel>
  );
}
