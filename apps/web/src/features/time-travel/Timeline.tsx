"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PixelButton } from "@/components/pixel/PixelButton";

type State = "locked" | "available" | "generating" | "ready" | "in_progress" | "completed" | "failed";

export type TimelineNode = {
  chapterId: string;
  week: number;
  title: string;
  eraName: string;
  eraYears: string;
  state: State;
  error: string | null;
  eraFinished: boolean;
};

/** The overworld: chapters as stops on a timeline. All rules are checked again on the server. */
export function Timeline({ gameId, initialNodes }: { gameId: string; initialNodes: TimelineNode[] }) {
  const router = useRouter();
  const [nodes, setNodes] = useState(initialNodes);
  const anyGenerating = nodes.some((n) => n.state === "generating");

  // If a chapter is generating (e.g. after a reload), poll until it finishes.
  useEffect(() => {
    if (!anyGenerating) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/games/${gameId}/chapters`).catch(() => null);
      if (!res?.ok) return;
      const { chapters } = (await res.json()) as { chapters: Record<string, { state: State; error?: string }> };
      const stillGenerating = Object.values(chapters).some((c) => c.state === "generating");
      if (!stillGenerating) router.refresh();
    }, 3000);
    return () => clearInterval(t);
  }, [anyGenerating, gameId, router]);

  function patch(chapterId: string, change: Partial<TimelineNode>) {
    setNodes((prev) => prev.map((n) => (n.chapterId === chapterId ? { ...n, ...change } : n)));
  }

  async function generate(node: TimelineNode) {
    patch(node.chapterId, { state: "generating", error: null });
    try {
      const res = await fetch(`/api/games/${gameId}/chapters/${node.chapterId}/generate`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { state?: State; error?: string };
      if (data.state) patch(node.chapterId, { state: data.state, error: data.error ?? null });
      else patch(node.chapterId, { state: "failed", error: data.error ?? "Generation failed." });
    } catch {
      patch(node.chapterId, { state: "failed", error: "Couldn't reach the server." });
    }
    router.refresh();
  }

  return (
    <ol className="relative grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
      {/* the timeline track */}
      <div
        aria-hidden
        className="absolute left-0 right-0 top-[2.25rem] hidden h-1 lg:block"
        style={{ background: "repeating-linear-gradient(to right, var(--px-muted) 0 8px, transparent 8px 16px)" }}
      />
      {nodes.map((node) => (
        <li key={node.chapterId} className="relative flex flex-col items-center text-center">
          <Marker state={node.state} />
          <div
            className={`px-frame mt-4 flex w-full flex-1 flex-col gap-3 p-4 ${
              node.state === "locked"
                ? "bg-px-night text-px-muted [--px-b:var(--px-wall-line)]"
                : "bg-px-ink [--px-b:var(--px-night)]"
            }`}
          >
            <p className="font-pixel text-[0.6rem] text-px-gold">{node.eraYears}</p>
            <p className="font-pixel text-[0.6rem] leading-relaxed">
              Week {node.week} · {node.title}
            </p>
            <p className="text-lg text-px-muted">{node.eraName}</p>
            <div className="mt-auto pt-2">
              <NodeAction gameId={gameId} node={node} onGenerate={() => generate(node)} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function NodeAction({ gameId, node, onGenerate }: { gameId: string; node: TimelineNode; onGenerate: () => void }) {
  const href = `/games/${gameId}/time-travel/${node.chapterId}`;
  switch (node.state) {
    case "locked":
      return <p className="font-pixel text-[0.55rem]">Locked</p>;
    case "available":
      return (
        <PixelButton onClick={onGenerate} className="w-full" aria-label={`Generate week ${node.week} era`}>
          Generate
        </PixelButton>
      );
    case "generating":
      return (
        <PixelButton disabled className="w-full" aria-label={`Generating week ${node.week} era`}>
          <span className="anim-blink">Generating…</span>
        </PixelButton>
      );
    case "ready":
      return (
        <PixelButton href={href} className="w-full" aria-label={`Enter week ${node.week} era`}>
          Enter era
        </PixelButton>
      );
    case "in_progress":
      return (
        <div className="space-y-2">
          {node.eraFinished && <p className="text-lg text-px-mint">Era done · teach Alex next</p>}
          <PixelButton
            href={href}
            variant={node.eraFinished ? "ghost" : "copper"}
            className="w-full"
            aria-label={`${node.eraFinished ? "Replay" : "Continue"} week ${node.week} era`}
          >
            {node.eraFinished ? "Replay era" : "Continue"}
          </PixelButton>
        </div>
      );
    case "completed":
      return (
        <PixelButton href={href} variant="ghost" className="w-full" aria-label={`Replay week ${node.week} era`}>
          Replay era
        </PixelButton>
      );
    case "failed":
      return (
        <div className="space-y-2 text-left">
          <p role="alert" className="text-lg text-px-red">
            {node.error ?? "Generation failed."}
          </p>
          <PixelButton onClick={onGenerate} className="w-full" aria-label={`Try generating week ${node.week} again`}>
            Try again
          </PixelButton>
        </div>
      );
  }
}

/** The stop on the timeline: padlock, glowing dot, gear, flag or stamp. */
function Marker({ state }: { state: State }) {
  const base = "relative z-10 flex h-12 w-12 items-center justify-center px-frame";
  switch (state) {
    case "locked":
      return (
        <span className={`${base} bg-px-night [--px-b:var(--px-wall-line)]`} aria-hidden>
          <svg viewBox="0 0 10 12" shapeRendering="crispEdges" className="h-6 w-5">
            <rect x="2" y="0" width="6" height="2" fill="#A79FBF" />
            <rect x="1" y="1" width="2" height="5" fill="#A79FBF" />
            <rect x="7" y="1" width="2" height="5" fill="#A79FBF" />
            <rect x="0" y="5" width="10" height="7" fill="#A79FBF" />
            <rect x="4" y="7" width="2" height="3" fill="#120E1E" />
          </svg>
        </span>
      );
    case "completed":
      return (
        <span className={`${base} -rotate-12 bg-px-red font-pixel text-[0.5rem] text-px-cream [--px-b:var(--px-ink)]`} aria-hidden>
          PASS
        </span>
      );
    case "generating":
      return (
        <span className={`${base} bg-px-ink [--px-b:var(--px-gold)]`} aria-hidden>
          <svg viewBox="0 0 12 12" shapeRendering="crispEdges" className="anim-spin h-7 w-7" fill="#F2C14E">
            <rect x="5" y="0" width="2" height="12" />
            <rect x="0" y="5" width="12" height="2" />
            <rect x="3" y="3" width="6" height="6" />
          </svg>
        </span>
      );
    case "failed":
      return (
        <span className={`${base} bg-px-ink font-pixel text-sm text-px-red [--px-b:var(--px-red)]`} aria-hidden>
          !
        </span>
      );
    default:
      return (
        <span
          className={`${base} bg-px-ink [--px-b:var(--px-mint)] ${state === "available" ? "anim-glow" : ""}`}
          aria-hidden
        >
          <span className={`h-4 w-4 ${state === "available" ? "bg-px-gold" : "bg-px-mint"}`} />
        </span>
      );
  }
}
