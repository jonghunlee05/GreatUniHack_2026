import type { Game } from "@/lib/game-schema";
import { SectionPlaceholder } from "@/components/SectionPlaceholder";

/**
 * TeachingRoom section. Owner: Shasha.
 * Receives the full generated game (chapters, ILOs, eras); see src/lib/game-schema.ts.
 * Replace the placeholder below with the real UI.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function TeachingRoomSection({ game }: { game: Game }) {
  return (
    <SectionPlaceholder
      slug="teaching-room"
      planned={[
        "Explain the chapter's concepts to Alex by chat (sketching is a stretch goal)",
        "Alex asks naive questions and interrupts on jargon",
        "Alex's brain is built only from what you teach him",
        "Alex teaches it back, mistakes included",
      ]}
    />
  );
}
