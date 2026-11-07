import type { Game } from "@/lib/game-schema";
import { chapterIdFor } from "@/lib/chapter-pack";
import { getPlayState } from "@/lib/play-state";
import { Timeline, type TimelineNode } from "./Timeline";

/**
 * Time-travel overworld (owner: Justin): one node per chapter on a timeline.
 * Chapter states and unlocks come from the server's play state.
 */
export async function TimeTravelSection({ game }: { game: Game }) {
  const play = await getPlayState(game);
  const nodes: TimelineNode[] = [...game.chapters]
    .sort((a, b) => a.week - b.week)
    .map((c) => {
      const id = chapterIdFor(c.week);
      const status = play.chapters[id];
      return {
        chapterId: id,
        week: c.week,
        title: c.title,
        eraName: c.era.name,
        eraYears: c.era.years,
        state: status?.state ?? "locked",
        error: status?.error ?? null,
        eraFinished: play.timeTravel[id]?.finished ?? false,
        ripple: play.timeTravel[id]?.ripple ?? null,
      };
    });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-pixel text-lg leading-relaxed text-px-mint">Time-travel</h2>
        <p className="mt-2 text-xl text-px-muted">
          Travel to the moment each idea was discovered. Generate an era to step inside it.
        </p>
      </div>
      {/* key: remount with fresh server state after router.refresh() */}
      <Timeline
        key={nodes.map((n) => `${n.chapterId}:${n.state}:${n.eraFinished}:${n.ripple}`).join("|")}
        gameId={game.id}
        initialNodes={nodes}
      />
    </div>
  );
}
