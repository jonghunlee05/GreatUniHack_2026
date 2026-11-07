import type { Era } from "@/lib/chapter-pack";

export type SkinName = Era["setting"]["skin"];

export type Skin = {
  label: string;
  wall: string;
  wallLine: string;
  floor: string;
  floorAlt: string;
  /** Text panel background + ink, used for scene text and dialogue. */
  panel: string;
  ink: string;
  accent: string;
  prop: "candle" | "radio" | "flask" | "monitor";
};

/** Era skins (spec: sepia | postwar | chemlab | modern). */
export const SKINS: Record<SkinName, Skin> = {
  sepia: {
    label: "Sepia",
    wall: "#5A4632",
    wallLine: "#6B5540",
    floor: "#3D2E20",
    floorAlt: "#35281C",
    panel: "#EFE2C4",
    ink: "#3B2A1A",
    accent: "#B5793A",
    prop: "candle",
  },
  postwar: {
    label: "Post-war",
    wall: "#4B5340",
    wallLine: "#59624C",
    floor: "#2F3428",
    floorAlt: "#292D23",
    panel: "#E6E2CF",
    ink: "#262A20",
    accent: "#A8A35A",
    prop: "radio",
  },
  chemlab: {
    label: "Chem lab",
    wall: "#2F5A5E",
    wallLine: "#3A6B70",
    floor: "#1F3B3E",
    floorAlt: "#1A3335",
    panel: "#E8F3F1",
    ink: "#12302F",
    accent: "#39D0E0",
    prop: "flask",
  },
  modern: {
    label: "Modern",
    wall: "#2C3550",
    wallLine: "#36405F",
    floor: "#1B2133",
    floorAlt: "#171C2C",
    panel: "#EEF1F8",
    ink: "#1A2033",
    accent: "#5BA7E8",
    prop: "monitor",
  },
};
