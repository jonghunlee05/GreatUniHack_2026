import type { Skin } from "../skins";
import { Portrait } from "./Portrait";

/**
 * Pixel room for the current scene, coloured by the era skin,
 * with the cast members who appear in this scene standing in it.
 */
export function SceneBackdrop({
  skin,
  place,
  year,
  cast,
}: {
  skin: Skin;
  place: string;
  year: string;
  cast: { name: string; role: "lead" | "cameo" }[];
}) {
  return (
    <div className="px-frame relative overflow-hidden [--px-b:var(--px-night)]">
      <svg viewBox="0 0 320 120" shapeRendering="crispEdges" className="block w-full" aria-hidden>
        <rect width="320" height="84" fill={skin.wall} />
        <rect y="20" width="320" height="2" fill={skin.wallLine} />
        <rect y="52" width="320" height="2" fill={skin.wallLine} />
        <rect y="84" width="320" height="36" fill={skin.floor} />
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x={i * 40 + (i % 2) * 20} y="84" width="20" height="36" fill={skin.floorAlt} />
        ))}
        {/* window */}
        <rect x="24" y="16" width="40" height="36" fill="#1A1428" />
        <rect x="28" y="20" width="32" height="28" fill={skin.accent} opacity="0.45" />
        <rect x="43" y="20" width="2" height="28" fill="#1A1428" />
        {/* table */}
        <rect x="220" y="64" width="80" height="6" fill="#4A3226" />
        <rect x="226" y="70" width="4" height="16" fill="#2E1F17" />
        <rect x="290" y="70" width="4" height="16" fill="#2E1F17" />
        <Prop kind={skin.prop} accent={skin.accent} />
      </svg>

      {/* cast standing in the room */}
      <div className="absolute inset-x-0 bottom-[8%] flex justify-center gap-6">
        {cast.map((c) => (
          <div key={c.name} className="flex flex-col items-center">
            <Portrait name={c.name} className={c.role === "lead" ? "h-20 w-auto sm:h-24" : "h-14 w-auto sm:h-16"} />
          </div>
        ))}
      </div>

      <p className="absolute left-3 top-2 font-pixel text-[0.55rem] text-px-cream drop-shadow-[2px_2px_0_#1A1428]">
        {place} · {year}
      </p>
    </div>
  );
}

function Prop({ kind, accent }: { kind: Skin["prop"]; accent: string }) {
  switch (kind) {
    case "candle":
      return (
        <g>
          <rect x="240" y="52" width="6" height="12" fill="#F3EBDD" />
          <rect className="anim-blink" x="241" y="46" width="4" height="6" fill="#F2C14E" />
          <rect x="262" y="56" width="20" height="8" fill="#8E2F2A" />
          <rect x="262" y="54" width="20" height="2" fill="#E2D6C0" />
        </g>
      );
    case "radio":
      return (
        <g>
          <rect x="246" y="46" width="32" height="18" fill="#6B4630" />
          <rect x="250" y="50" width="14" height="10" fill="#2E1F17" />
          <rect className="anim-blink" x="268" y="52" width="6" height="6" fill={accent} />
        </g>
      );
    case "flask":
      return (
        <g>
          <rect x="242" y="48" width="6" height="8" fill="#C0C6D0" />
          <rect x="238" y="56" width="14" height="8" fill={accent} />
          <rect x="262" y="44" width="4" height="20" fill="#C0C6D0" />
          <rect className="anim-glow" x="262" y="54" width="4" height="10" fill="#4FBF8E" />
          <rect x="274" y="52" width="12" height="12" fill="#9AA0AE" />
        </g>
      );
    case "monitor":
      return (
        <g>
          <rect x="244" y="40" width="36" height="22" fill="#1A1428" />
          <rect className="anim-glow" x="248" y="44" width="28" height="14" fill={accent} />
          <rect x="258" y="62" width="8" height="2" fill="#9AA0AE" />
        </g>
      );
  }
}
