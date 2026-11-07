"use client";

import type { KeyboardEvent } from "react";
import type { SceneArt as Art } from "@/lib/chapter-pack";
import type { Skin } from "../skins";
import { Portrait, type Pose } from "../components/Portrait";
import { PROPS, type Location } from "./catalog";
import { PROP_ART } from "./props";
import { OUTDOOR, layoutProps } from "./layout";

type Hotspot = { propId: string; label: string; found: boolean; onFind: () => void };

/**
 * Draws one scene from its art plan: room or outdoor setting, the view, time of day,
 * weather, ambient effect and props. Props hiding a clue are clickable hotspots.
 */
export function SceneArt({
  art,
  skin,
  place,
  year,
  cast,
  hotspots,
}: {
  art: Art;
  skin: Skin;
  place: string;
  year: string;
  cast: { name: string; role: "lead" | "cameo"; pose: Pose }[];
  hotspots: Hotspot[];
}) {
  const location = art.location as Location;
  const outdoor = OUTDOOR.includes(location);
  const placed = layoutProps(art, hotspots.map((h) => h.propId));
  const hotspotFor = new Map(hotspots.map((h) => [h.propId, h]));
  const sky = SKY[art.time] ?? SKY.day;

  return (
    <div className="px-frame relative overflow-hidden [--px-b:var(--px-night)]">
      <svg viewBox="0 0 320 120" shapeRendering="crispEdges" className="block w-full" role="group" aria-label={`${place}, ${year}`}>
        {outdoor ? (
          <Outdoor location={location} view={art.view} sky={sky} skin={skin} ambient={art.ambient} />
        ) : (
          <Indoor location={location} view={art.view} sky={sky} skin={skin} />
        )}

        {placed.map((p) => {
          const draw = PROP_ART[p.id];
          const hs = hotspotFor.get(p.id);
          const body = (
            <g transform={`translate(${p.x} ${p.y})`}>
              {p.onStand && <rect x={-9} y={0} width={18} height={10} fill="#6B4630" />}
              {hs && (
                <rect
                  className="hs-ring"
                  x={-draw.w / 2 - 3}
                  y={-draw.h - 3}
                  width={draw.w + 6}
                  height={draw.h + 6}
                  fill="none"
                  stroke="#F2C14E"
                  strokeWidth={2}
                />
              )}
              {draw.rects.map(([x, y, w, h, fill, anim], i) => (
                <rect key={i} x={x} y={y} width={w} height={h} fill={fill} className={anim} />
              ))}
              {hs && !hs.found && (
                <rect className="anim-blink" x={draw.w / 2 - 1} y={-draw.h - 2} width={3} height={3} fill="#FFFFFF" />
              )}
            </g>
          );
          if (!hs) return <g key={p.id}>{body}</g>;
          return (
            <g
              key={p.id}
              role="button"
              tabIndex={0}
              aria-label={hs.found ? `${hs.label} (searched)` : `Search the ${hs.label.toLowerCase()}`}
              className="hotspot"
              onClick={hs.onFind}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  hs.onFind();
                }
              }}
            >
              {body}
            </g>
          );
        })}

        <Weather kind={art.weather} outdoor={outdoor} />
        <Ambient kind={art.ambient} outdoor={outdoor} />
        {art.time !== "day" && (
          <rect width="320" height="120" fill={art.time === "night" ? "#0B1030" : "#C7773A"} opacity={art.time === "night" ? 0.35 : 0.14} pointerEvents="none" />
        )}
      </svg>

      <div className="pointer-events-none absolute inset-x-0 bottom-[6%] flex justify-center gap-6">
        {cast.map((c) => (
          <Portrait key={c.name} name={c.name} pose={c.pose} className={c.role === "lead" ? "h-20 w-auto sm:h-24" : "h-14 w-auto sm:h-16"} />
        ))}
      </div>

      <p className="absolute right-3 top-2 font-pixel text-[0.55rem] text-px-cream drop-shadow-[2px_2px_0_#1A1428]">
        {place} · {year}
      </p>
    </div>
  );
}

const SKY: Record<string, string> = { day: "#8EC5E8", dusk: "#E89A5B", night: "#141A3A" };

function Indoor({ location, view, sky, skin }: { location: Location; view: string; sky: string; skin: Skin }) {
  const tiled = location === "lab" || location === "hospital" || location === "modern_lab";
  const brick = location === "workshop" || location === "factory";
  const wall = location === "modern_lab" ? "#C8CFDC" : location === "hospital" ? "#B9C4B8" : skin.wall;
  const line = location === "modern_lab" ? "#AEB6C6" : location === "hospital" ? "#A3AFA2" : skin.wallLine;

  return (
    <g>
      <rect width="320" height="84" fill={wall} />
      {tiled &&
        Array.from({ length: 16 }, (_, i) => <rect key={`v${i}`} x={i * 20} y="0" width="1" height="84" fill={line} />)}
      {tiled && [21, 42, 63].map((y) => <rect key={`h${y}`} x="0" y={y} width="320" height="1" fill={line} />)}
      {brick &&
        Array.from({ length: 7 }, (_, row) =>
          Array.from({ length: 17 }, (_, i) => (
            <rect key={`${row}-${i}`} x={i * 20 + (row % 2) * 10} y={row * 12} width="18" height="10" fill={line} opacity="0.55" />
          )),
        )}
      {location === "study" && Array.from({ length: 11 }, (_, i) => <rect key={i} x={i * 30} y="54" width="2" height="30" fill={line} />)}
      {location === "study" && <rect x="0" y="52" width="320" height="2" fill={line} />}

      {view !== "none" && <Window view={view} sky={sky} />}

      {/* floor */}
      <rect y="84" width="320" height="36" fill={location === "modern_lab" ? "#6E7382" : skin.floor} />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={i * 40 + (i % 2) * 20} y="84" width="20" height="36" fill={location === "modern_lab" ? "#626777" : skin.floorAlt} />
      ))}
      {location === "study" && <rect x="120" y="96" width="80" height="14" fill="#5A1E1A" opacity="0.8" />}

      {/* the table / bench props stand on */}
      {location === "lecture_hall" ? (
        <g>
          <rect x="230" y="50" width="30" height="34" fill="#6B4630" />
          <rect x="226" y="48" width="38" height="4" fill="#8A5A34" />
          <rect x="196" y="64" width="34" height="4" fill="#6B4630" />
          <rect x="262" y="64" width="42" height="4" fill="#6B4630" />
        </g>
      ) : (
        <g>
          <rect x="196" y="66" width="108" height="5" fill={tiled ? "#9AA0AE" : brick ? "#5A3A22" : "#4A3226"} />
          <rect x="202" y="71" width="4" height="15" fill="#2E1F17" />
          <rect x="294" y="71" width="4" height="15" fill="#2E1F17" />
        </g>
      )}
    </g>
  );
}

function Window({ view, sky }: { view: string; sky: string }) {
  return (
    <g>
      <rect x="16" y="10" width="48" height="44" fill="#1A1428" />
      <svg x="20" y="14" width="40" height="36" viewBox="0 0 40 36">
        <rect width="40" height="36" fill={sky} />
        <View view={view} w={40} h={36} />
      </svg>
      <rect x="39" y="14" width="2" height="36" fill="#1A1428" />
      <rect x="20" y="31" width="40" height="2" fill="#1A1428" />
    </g>
  );
}

/** What's outside, drawn in a w×h box with the horizon near the bottom. */
function View({ view, w, h }: { view: string; w: number; h: number }) {
  const g = h * 0.7;
  switch (view) {
    case "city":
      return (
        <g fill="#3A3A55">
          {[0, 7, 13, 21, 28, 34].map((x, i) => (
            <rect key={x} x={(x * w) / 40} y={g - [8, 13, 6, 11, 15, 9][i]} width={(6 * w) / 40} height={h} />
          ))}
          <rect x={(15 * w) / 40} y={g - 9} width="1" height="1" fill="#F2C14E" />
        </g>
      );
    case "countryside":
      return (
        <g>
          <rect y={g - 4} width={w} height={h} fill="#4E8A4E" />
          <rect x={w * 0.1} y={g - 9} width={w * 0.35} height={8} fill="#3F7A42" />
          <rect x={w * 0.55} y={g - 7} width={w * 0.4} height={6} fill="#5B9A55" />
        </g>
      );
    case "river":
    case "harbour":
      return (
        <g>
          <rect y={g - 6} width={w} height={6} fill="#4E8A4E" />
          <rect y={g} width={w} height={h} fill="#3B6EA5" />
          <rect className="anim-blink" x={w * 0.2} y={g + 3} width={w * 0.2} height="1" fill="#9FC8F0" />
          {view === "harbour" && (
            <g fill="#4A3226">
              <rect x={w * 0.6} y={g - 2} width={w * 0.25} height="3" />
              <rect x={w * 0.7} y={g - 16} width="1" height="14" />
              <rect x={w * 0.7 + 1} y={g - 14} width={w * 0.1} height="8" fill="#F3EBDD" />
            </g>
          )}
        </g>
      );
    case "chimneys":
      return (
        <g>
          <rect y={g - 5} width={w} height={h} fill="#3A3A48" />
          {[0.15, 0.45, 0.75].map((x) => (
            <g key={x}>
              <rect x={w * x} y={g - 20} width={w * 0.08} height={20} fill="#5A1E1A" />
              <rect className="anim-puff" x={w * x - 1} y={g - 26} width={w * 0.12} height="4" fill="#9AA0AE" />
            </g>
          ))}
        </g>
      );
    case "night_sky":
      return (
        <g>
          {[[0.15, 0.2], [0.4, 0.1], [0.7, 0.25], [0.85, 0.12], [0.3, 0.4]].map(([x, y], i) => (
            <rect key={i} className={i % 2 ? "anim-blink" : undefined} x={w * x} y={h * y} width="1" height="1" fill="#F3EBDD" />
          ))}
          <rect x={w * 0.6} y={h * 0.08} width="5" height="5" fill="#F3EBDD" />
          <rect y={g} width={w} height={h} fill="#1A1A30" />
        </g>
      );
    case "campus":
      return (
        <g>
          <rect y={g} width={w} height={h} fill="#4E8A4E" />
          <rect x={w * 0.2} y={g - 14} width={w * 0.6} height={14} fill="#C8B89A" />
          <rect x={w * 0.15} y={g - 17} width={w * 0.7} height="3" fill="#A89A7A" />
          {[0.27, 0.42, 0.57, 0.72].map((x) => (
            <rect key={x} x={w * x} y={g - 12} width="2" height="12" fill="#F3EBDD" />
          ))}
        </g>
      );
    default:
      return null;
  }
}

function Outdoor({ location, view, sky, skin, ambient }: { location: Location; view: string; sky: string; skin: Skin; ambient: string }) {
  return (
    <g>
      <rect width="320" height="84" fill={sky} />
      <svg x="0" y="20" width="320" height="64" viewBox="0 0 320 64">
        <View view={view === "none" ? (location === "riverside" ? "countryside" : "city") : view} w={320} h={64} />
      </svg>
      {location === "riverside" ? (
        <g>
          <rect y="80" width="320" height="14" fill="#3B6EA5" />
          {[20, 120, 220].map((x, i) => (
            <rect key={x} className={ambient === "water" || i === 1 ? "anim-slide" : undefined} x={x} y="85" width="30" height="2" fill="#9FC8F0" />
          ))}
          <rect y="94" width="320" height="26" fill="#5B7A3A" />
          <rect y="94" width="320" height="3" fill="#4A6A2E" />
        </g>
      ) : (
        <g>
          <rect y="84" width="320" height="36" fill="#55505E" />
          {Array.from({ length: 16 }, (_, i) => (
            <rect key={i} x={i * 20 + (i % 2) * 6} y={90 + (i % 3) * 8} width="10" height="4" fill="#47424F" />
          ))}
          <rect x="250" y="44" width="4" height="40" fill="#1A1428" />
          <rect x="246" y="38" width="12" height="8" fill="#2E1F17" />
          <rect className="anim-glow" x="248" y="40" width="8" height="5" fill={skin.accent === "#5BA7E8" ? "#F3EBDD" : "#F2C14E"} />
        </g>
      )}
    </g>
  );
}

function Weather({ kind, outdoor }: { kind: string; outdoor: boolean }) {
  if (kind === "clear") return null;
  if (kind === "fog") return <rect y={outdoor ? 30 : 10} width="320" height={outdoor ? 70 : 44} fill="#E8E8F0" opacity="0.18" pointerEvents="none" />;
  const drops = Array.from({ length: outdoor ? 24 : 6 }, (_, i) => {
    const x = outdoor ? (i * 37) % 320 : 22 + ((i * 7) % 36);
    const y = outdoor ? (i * 23) % 80 : 16 + ((i * 11) % 30);
    return kind === "rain" ? (
      <rect key={i} className="anim-blink" style={{ animationDelay: `${(i % 4) * 0.2}s` }} x={x} y={y} width="1" height="4" fill="#9FC8F0" />
    ) : (
      <rect key={i} className="anim-blink" style={{ animationDelay: `${(i % 4) * 0.2}s` }} x={x} y={y} width="2" height="2" fill="#F3EBDD" />
    );
  });
  return <g pointerEvents="none">{drops}</g>;
}

function Ambient({ kind, outdoor }: { kind: string; outdoor: boolean }) {
  switch (kind) {
    case "steam":
      return (
        <g fill="#E8E8F0" opacity="0.7" pointerEvents="none">
          {[0, 0.5, 1].map((d, i) => (
            <rect key={i} className="anim-puff" style={{ animationDelay: `${d}s` }} x={240 + i * 10} y={44 - i * 4} width="6" height="4" />
          ))}
        </g>
      );
    case "water":
      return outdoor ? null : (
        <g fill="#5BA7E8" pointerEvents="none">
          <rect className="anim-blink" x="110" y="96" width="2" height="3" />
          <rect x="104" y="102" width="14" height="1" opacity="0.6" />
        </g>
      );
    case "flicker":
      return <rect className="anim-blink" width="320" height="120" fill="#F2C14E" opacity="0.06" pointerEvents="none" />;
    case "sparks":
      return (
        <g fill="#F2C14E" pointerEvents="none">
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} className="anim-blink" style={{ animationDelay: `${i * 0.15}s` }} x={60 + i * 7} y={76 - (i % 3) * 6} width="2" height="2" />
          ))}
        </g>
      );
    default:
      return null;
  }
}

/** Label for a prop id (used for hotspot aria-labels). */
export function propLabel(id: string): string {
  return PROPS[id]?.label ?? id;
}
