/**
 * The four sections inside a game (see docs/app-flow.png).
 * Single source of truth for the game hub and the section nav.
 * Each section's UI lives in src/features/<slug>/.
 */
export type SectionSlug = "profile" | "time-travel" | "teaching-room" | "assessment-room";

export type Section = {
  slug: SectionSlug;
  name: string;
  tagline: string;
  /** Diagram colour: mint = Justin, lilac = Shasha. */
  tone: "mint" | "lilac";
  owner: "Justin" | "Shasha";
};

export const SECTIONS: Section[] = [
  {
    slug: "profile",
    name: "Profile",
    tagline: "Badges, stars and your progress",
    tone: "mint",
    owner: "Justin",
  },
  {
    slug: "time-travel",
    name: "Time-travel",
    tagline: "Travel through the history of ideas",
    tone: "mint",
    owner: "Justin",
  },
  {
    slug: "teaching-room",
    name: "Teaching room",
    tagline: "Teach Alex what you've learned",
    tone: "lilac",
    owner: "Shasha",
  },
  {
    slug: "assessment-room",
    name: "Assessment room",
    tagline: "You, Alex and a problem, every week",
    tone: "lilac",
    owner: "Shasha",
  },
];

export const TONE_CLASSES: Record<Section["tone"], { card: string; ink: string }> = {
  mint: { card: "bg-mint border-mint-ink/40 hover:border-mint-ink", ink: "text-mint-ink" },
  lilac: { card: "bg-lilac border-lilac-ink/40 hover:border-lilac-ink", ink: "text-lilac-ink" },
};

export function getSection(slug: SectionSlug): Section {
  return SECTIONS.find((s) => s.slug === slug)!;
}
