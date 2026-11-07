import type { Game } from "@/lib/game-schema";
import { SectionPlaceholder } from "@/components/SectionPlaceholder";

/**
 * Profile section. Owner: Justin.
 * Receives the full generated game (chapters, ILOs, eras); see src/lib/game-schema.ts.
 * Replace the placeholder below with the real UI.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ProfileSection({ game }: { game: Game }) {
  return (
    <SectionPlaceholder
      slug="profile"
      planned={[
        "Stars earned per chapter",
        "Badges unlocked",
        "Overall course progress",
        "Alex's brain map: what Alex knows and misunderstands (stretch)",
      ]}
    />
  );
}
