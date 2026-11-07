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
      <CosyRoom />

      {live && (
        <span className="anim-blink absolute left-[3%] top-[3%] z-30 bg-px-red px-2 py-1 font-pixel text-[0.5rem] text-px-cream">
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

      {/* Alex's speech bubble, top centre (between the blackboard and the window) */}
      <div className="absolute left-[3%] right-[3%] top-[5%] z-20 sm:left-[36%] sm:right-auto sm:w-[33%]">
        <div className="px-frame relative bg-px-cream p-3 text-px-ink [--px-b:var(--px-ink)]">
          <p className="font-pixel text-[0.45rem] text-px-violet">ALEX</p>
          <p className="mt-1 line-clamp-5 text-lg leading-snug">{bubble}</p>
        </div>
      </div>
    </div>
  );
}

type DayPart = "morning" | "afternoon" | "evening" | "night";

function dayPart(hour: number): DayPart {
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 20) return "evening";
  return "night";
}

const SKY: Record<DayPart, { top: string; bottom: string; beam: number }> = {
  morning: { top: "#8EC5E8", bottom: "#CDE8F5", beam: 0.12 },
  afternoon: { top: "#6FB0E0", bottom: "#B8DDF2", beam: 0.1 },
  evening: { top: "#C7773A", bottom: "#F2C14E", beam: 0.08 },
  night: { top: "#141A3A", bottom: "#2A2F5A", beam: 0 },
};

/**
 * The cosy room behind the stations: wallpaper, wood panelling, a big window
 * whose sky follows your local time of day, curtains, sunbeam, fairy lights, lamp and rug.
 * Drawn in a 320×120 grid, stretched to the scene.
 */
function CosyRoom() {
  const part = dayPart(new Date().getHours());
  const sky = SKY[part];
  const night = part === "night";
  const lights = ["#E0604A", "#F2C14E", "#4FBF8E", "#5BA7E8", "#A89CF5"];

  return (
    <svg viewBox="0 0 320 120" preserveAspectRatio="none" shapeRendering="crispEdges" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="room-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky.top} />
          <stop offset="1" stopColor={sky.bottom} />
        </linearGradient>
      </defs>

      {/* wallpaper with soft stripes */}
      <rect width="320" height="100" fill="#3D3058" />
      {Array.from({ length: 20 }, (_, i) => (
        <rect key={i} x={i * 16} y="0" width="6" height="62" fill="#463866" />
      ))}
      {/* wood panelling (wainscot) + skirting */}
      <rect y="62" width="320" height="36" fill="#5A4232" />
      {Array.from({ length: 16 }, (_, i) => (
        <rect key={i} x={i * 20 + 2} y="66" width="16" height="28" fill="#634A38" />
      ))}
      <rect y="61" width="320" height="2" fill="#8A6A4A" />

      {/* floor boards */}
      <rect y="98" width="320" height="22" fill="#4A3226" />
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x={i * 32 + (i % 2) * 16} y="98" width="1" height="22" fill="#3A271D" />
      ))}
      <rect y="97" width="320" height="2" fill="#6B4630" />

      {/* rug under the desk */}
      <rect x="118" y="104" width="84" height="12" fill="#8E2F2A" />
      <rect x="122" y="106" width="76" height="8" fill="#A8433A" />
      <rect x="126" y="109" width="68" height="2" fill="#F2C14E" opacity="0.6" />

      {/* the big window */}
      <rect x="226" y="10" width="72" height="50" fill="#6B4630" />
      <rect x="230" y="14" width="64" height="42" fill="url(#room-sky)" />
      {night ? (
        <g>
          {[[238, 20], [252, 26], [268, 18], [282, 24], [246, 34], [288, 36]].map(([x, y], i) => (
            <rect key={i} className={i % 2 ? "anim-blink" : undefined} x={x} y={y} width="1" height="1" fill="#F3EBDD" />
          ))}
          <rect x="274" y="18" width="7" height="7" fill="#F3EBDD" />
          <rect x="277" y="18" width="4" height="4" fill="#2A2F5A" />
        </g>
      ) : (
        <g>
          <rect x={part === "evening" ? 272 : 278} y={part === "evening" ? 38 : 19} width="8" height="8" fill={part === "evening" ? "#E0604A" : "#FFE08A"} />
          <rect className="anim-glow" x="236" y="22" width="14" height="3" fill="#FFFFFF" opacity="0.8" />
          <rect x="240" y="20" width="8" height="2" fill="#FFFFFF" opacity="0.8" />
        </g>
      )}
      {/* hills and trees in the view */}
      <rect x="230" y="44" width="64" height="12" fill={night ? "#1F3A2E" : "#4E8A4E"} />
      <rect x="230" y="40" width="26" height="6" fill={night ? "#244233" : "#5B9A55"} />
      <rect x="262" y="42" width="32" height="4" fill={night ? "#1C3529" : "#3F7A42"} />
      <rect x="244" y="34" width="6" height="10" fill={night ? "#16291F" : "#2F5A40"} />
      <rect x="246" y="44" width="2" height="3" fill="#4A3226" />
      <rect x="276" y="36" width="5" height="8" fill={night ? "#16291F" : "#2F5A40"} />
      {/* window bars + sill */}
      <rect x="261" y="14" width="2" height="42" fill="#6B4630" />
      <rect x="230" y="34" width="64" height="2" fill="#6B4630" />
      <rect x="222" y="58" width="80" height="4" fill="#8A6A4A" />
      {/* plant on the sill */}
      <rect x="284" y="52" width="8" height="6" fill="#C7773A" />
      <rect x="287" y="44" width="2" height="8" fill="#2F5A40" />
      <rect x="282" y="45" width="5" height="3" fill="#4FBF8E" />
      <rect x="289" y="47" width="5" height="3" fill="#4FBF8E" />
      {/* curtains + rod */}
      <rect x="218" y="6" width="88" height="3" fill="#C79A2E" />
      <rect x="218" y="8" width="10" height="52" fill="#8E2F2A" />
      <rect x="220" y="8" width="2" height="52" fill="#A8433A" />
      <rect x="296" y="8" width="10" height="52" fill="#8E2F2A" />
      <rect x="302" y="8" width="2" height="52" fill="#A8433A" />

      {/* sunbeam across the floor */}
      {sky.beam > 0 && <polygon points="232,56 292,56 250,120 170,120" fill="#FFE08A" opacity={sky.beam} />}

      {/* hanging lamp */}
      <rect x="179" y="0" width="1" height="14" fill="#1A1428" />
      <rect x="172" y="14" width="16" height="6" fill="#C79A2E" />
      <rect className="anim-glow" x="174" y="20" width="12" height="3" fill="#FFE08A" />
      <polygon points="172,23 188,23 200,40 160,40" fill="#FFE08A" opacity="0.05" />

      {/* fairy lights along the top */}
      <rect x="0" y="0" width="215" height="1" fill="#1A1428" opacity="0.6" />
      {Array.from({ length: 18 }, (_, i) => (
        <rect
          key={i}
          className="anim-blink"
          style={{ animationDelay: `${(i % 5) * 0.25}s` }}
          x={6 + i * 12}
          y={1 + (i % 2)}
          width="2"
          height="2"
          fill={lights[i % lights.length]}
        />
      ))}

      {/* gentle evening / night tint */}
      {part === "evening" && <rect width="320" height="120" fill="#C7773A" opacity="0.08" />}
      {night && <rect width="320" height="120" fill="#0B1030" opacity="0.18" />}
    </svg>
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
