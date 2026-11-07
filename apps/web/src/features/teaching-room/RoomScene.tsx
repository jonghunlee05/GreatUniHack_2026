"use client";

import type { ReactNode } from "react";
import { AlexSprite, type AlexReaction } from "@/components/pixel/AlexSprite";

export type ZoneId = "desk" | "blackboard" | "sofa" | "standup";

/** The four teaching modes: a spot in the room, a tab, and Alex's standing position. */
export const ZONES: {
  id: ZoneId;
  tab: string;
  label: string;
  hint: string;
  box: string;
  alexLeft: string;
  art: ReactNode;
}[] = [
  {
    id: "desk",
    tab: "💬 Chat",
    label: "Desk",
    hint: "type and chat",
    box: "left-[40%] bottom-[12%] h-[30%] w-[20%]",
    alexLeft: "52%",
    art: (
      <span className="absolute inset-0">
        <span className="absolute inset-x-0 top-[30%] h-[18%] bg-px-wood" />
        <span className="absolute left-[6%] top-[48%] h-[52%] w-[8%] bg-px-wood-dark" />
        <span className="absolute right-[6%] top-[48%] h-[52%] w-[8%] bg-px-wood-dark" />
        <span className="absolute left-[20%] top-[10%] h-[20%] w-[22%] bg-px-cream" />
        <span className="absolute right-[18%] top-0 h-[30%] w-[14%] bg-px-gold" />
      </span>
    ),
  },
  {
    id: "blackboard",
    tab: "✏️ Draw",
    label: "Blackboard",
    hint: "draw a diagram",
    box: "left-[4%] top-[10%] h-[34%] w-[30%]",
    alexLeft: "36%",
    art: (
      <span className="absolute inset-0 border-4 border-px-wood bg-[#2f4a3a]">
        <span className="absolute left-[12%] top-[25%] h-1 w-[45%] bg-px-cream/70" />
        <span className="absolute left-[12%] top-[45%] h-1 w-[30%] bg-px-cream/70" />
        <span className="absolute right-[12%] top-[30%] h-6 w-6 border-2 border-px-cream/70" />
      </span>
    ),
  },
  {
    id: "sofa",
    tab: "🎙 Voice note",
    label: "Sofa",
    hint: "record a voice note",
    box: "right-[4%] bottom-[12%] h-[32%] w-[24%]",
    alexLeft: "70%",
    art: (
      <span className="absolute inset-0">
        <span className="absolute inset-x-[8%] top-0 h-[45%] bg-[#6b5bb5]" />
        <span className="absolute inset-x-0 top-[40%] h-[35%] bg-[#7d6cd0]" />
        <span className="absolute left-0 top-[25%] h-[55%] w-[10%] bg-[#5a4b9e]" />
        <span className="absolute right-0 top-[25%] h-[55%] w-[10%] bg-[#5a4b9e]" />
        <span className="absolute bottom-0 left-[10%] h-[25%] w-[6%] bg-px-ink" />
        <span className="absolute bottom-0 right-[10%] h-[25%] w-[6%] bg-px-ink" />
      </span>
    ),
  },
  {
    id: "standup",
    tab: "🔴 Live stand-up",
    label: "Stand-up mic",
    hint: "talk live with Alex",
    box: "left-[6%] bottom-[12%] h-[28%] w-[12%]",
    alexLeft: "24%",
    art: (
      <span className="absolute inset-0">
        {/* spotlight */}
        <span className="absolute -inset-x-[30%] bottom-0 h-[30%] bg-px-gold/15" />
        {/* mic head, stand and base */}
        <span className="absolute left-[38%] top-0 h-[20%] w-[24%] bg-[#C0C6D0]" />
        <span className="absolute left-[42%] top-[4%] h-[12%] w-[16%] bg-[#6E7382]" />
        <span className="absolute left-[47%] top-[20%] h-[70%] w-[6%] bg-px-ink" />
        <span className="absolute bottom-0 left-[20%] h-[10%] w-[60%] bg-px-ink" />
        <span className="anim-blink absolute right-[20%] top-[2%] h-[8%] w-[10%] bg-px-red" />
      </span>
    ),
  },
];

/**
 * The teaching room: click a spot (or a tab) to choose how to teach; Alex walks there.
 * Alex's latest line sits in a speech bubble inside the room.
 */
export function RoomScene({
  selected,
  onSelect,
  reaction,
  bubble,
  live,
}: {
  selected: ZoneId;
  onSelect: (zone: ZoneId) => void;
  reaction: AlexReaction;
  bubble: string;
  /** stand-up is running: show the "on air" sign */
  live: boolean;
}) {
  const zone = ZONES.find((z) => z.id === selected)!;
  return (
    <div
      className="px-frame relative h-80 overflow-hidden bg-px-wall [--px-b:var(--px-night)] sm:h-96"
      data-testid="teaching-scene"
    >
      {/* wall panelling + floor */}
      <div className="absolute inset-x-0 top-[52%] h-1 bg-px-wall-line" />
      <div className="absolute inset-x-0 bottom-0 h-[18%] bg-px-wood-dark" />
      <div className="absolute inset-x-0 bottom-[18%] h-1 bg-px-wood" />

      {live && (
        <span className="anim-blink absolute left-[40%] top-[6%] z-10 bg-px-red px-2 py-1 font-pixel text-[0.5rem] text-px-cream">
          ● ON AIR
        </span>
      )}

      {ZONES.map((z) => (
        <button
          key={z.id}
          type="button"
          onClick={() => onSelect(z.id)}
          aria-pressed={selected === z.id}
          aria-label={`${z.label}: ${z.hint}`}
          className={`group absolute ${z.box} outline-none`}
        >
          {z.art}
          <span
            className={`absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap font-pixel text-[0.5rem] ${
              selected === z.id ? "text-px-gold" : "text-px-muted group-hover:text-px-cream group-focus-visible:text-px-cream"
            }`}
          >
            {selected === z.id ? "▼ " : ""}
            {z.label.toUpperCase()}
          </span>
          <span
            className={`pointer-events-none absolute inset-0 border-4 ${
              selected === z.id ? "border-px-gold" : "border-transparent group-hover:border-px-violet group-focus-visible:border-px-violet"
            }`}
          />
        </button>
      ))}

      {/* Alex walks to the chosen spot (CSS transition) */}
      <div
        className="pointer-events-none absolute bottom-[8%] z-10 w-16 -translate-x-1/2 transition-[left] duration-700 ease-in-out sm:w-20"
        style={{ left: zone.alexLeft }}
        data-testid="alex-position"
        data-zone={selected}
      >
        <AlexSprite mood={reaction} className="w-full" label={`Alex looks ${reaction.replace("_", " ")}`} />
        <p className="mt-1 text-center font-pixel text-[0.45rem] text-px-violet" data-testid="alex-reaction">
          {reaction === "got_it" ? "got it!" : reaction}
        </p>
      </div>

      {/* Alex's speech bubble, top right of the room */}
      <div className="absolute right-[3%] top-[6%] z-20 w-[54%] max-w-md">
        <div className="px-frame relative bg-px-cream p-3 text-px-ink [--px-b:var(--px-ink)]">
          <p className="font-pixel text-[0.45rem] text-px-violet">ALEX</p>
          <p className="mt-1 line-clamp-5 text-lg leading-snug">{bubble}</p>
        </div>
      </div>
    </div>
  );
}

/** Mode tabs under the room (same choices as the room spots). */
export function ModeTabs({ selected, onSelect }: { selected: ZoneId; onSelect: (zone: ZoneId) => void }) {
  return (
    <div role="tablist" aria-label="How do you want to teach Alex?" className="flex flex-wrap gap-3">
      {ZONES.map((z) => (
        <button
          key={z.id}
          type="button"
          role="tab"
          aria-selected={selected === z.id}
          onClick={() => onSelect(z.id)}
          className={`px-frame m-1 px-3 py-2 font-pixel text-[0.55rem] leading-relaxed ${
            selected === z.id
              ? "bg-px-ink text-px-gold [--px-b:var(--px-gold)]"
              : "bg-px-wall-line text-px-muted hover:text-px-cream [--px-b:var(--px-ink)]"
          }`}
        >
          {z.tab}
        </button>
      ))}
    </div>
  );
}
