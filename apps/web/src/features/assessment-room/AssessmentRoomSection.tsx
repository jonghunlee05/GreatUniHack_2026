import type { Game } from "@/lib/game-schema";
import { SectionPlaceholder } from "@/components/SectionPlaceholder";

/**
 * AssessmentRoom section. Owner: Shasha.
 * Receives the full generated game (chapters, ILOs, eras); see src/lib/game-schema.ts.
 * Replace the placeholder below with the real UI.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function AssessmentRoomSection({ game }: { game: Game }) {
  return (
    <SectionPlaceholder
      slug="assessment-room"
      planned={[
        "Weekly practical: you, Alex and a problem",
        "Alex applies only what he was taught, so misconceptions show up as failures",
        "Graded against the chapter's ILOs: score /100, stars and badges",
        "Gaps loop back to the teaching room",
      ]}
    />
  );
}
