import type { Game } from "@/lib/game-schema";
import { SectionPlaceholder } from "@/components/SectionPlaceholder";

/**
 * TimeTravel section. Owner: Justin.
 * Receives the full generated game (chapters, ILOs, eras); see src/lib/game-schema.ts.
 * Replace the placeholder below with the real UI.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function TimeTravelSection({ game }: { game: Game }) {
  return (
    <SectionPlaceholder
      slug="time-travel"
      planned={[
        "The course as a timeline of historical eras, one per chapter",
        "Investigate the real engineering problem behind each concept",
        "Meet each era's mentor character",
        "Knowledge debt carried across eras",
      ]}
    />
  );
}
