"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { STAR_PIXELS } from "@/components/pixel/PixelStar";

type Props = {
  gameId: string;
  /** e.g. "PCB Design · 1940s" */
  hudLabel: string;
  stars: number;
  maxStars: number;
  /** 0..1 */
  progress: number;
  currentWeek: number;
};

/**
 * The game lobby: a pixel room with four stations (from the lobby mock-up).
 * Each station is a keyboard-focusable SVG link to its section.
 */
export function LobbyScene({ gameId, hudLabel, stars, maxStars, progress, currentWeek }: Props) {
  const router = useRouter();
  const base = `/games/${gameId}`;
  const label = hudLabel.length > 30 ? `${hudLabel.slice(0, 29)}…` : hudLabel;

  return (
    <svg
      width="100%"
      viewBox="0 0 680 420"
      shapeRendering="crispEdges"
      role="group"
      aria-label="Lobby. Choose a station."
      className="px-frame block [--px-b:var(--px-night)]"
    >
      <defs>
        <pattern id="fl" width="80" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="#6B4630" />
          <rect x="40" width="40" height="40" fill="#5E3D29" />
        </pattern>
      </defs>
      {/* room */}
      <rect width="680" height="258" fill="#2A2140" />
      <rect y="40" width="680" height="4" fill="#33294D" />
      <rect y="120" width="680" height="4" fill="#33294D" />
      <rect y="200" width="680" height="4" fill="#33294D" />
      <rect y="250" width="680" height="8" fill="#1A1428" />
      <rect y="258" width="680" height="162" fill="url(#fl)" />

      {/* HUD */}
      <rect width="680" height="30" fill="#120E1E" />
      <text className="font-pixel" fontSize="11" x="14" y="20" fill="#F3EBDD">
        {label}
      </text>
      <g transform="translate(424 9)" aria-hidden>
        {STAR_PIXELS.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x * 2} y={y * 2} width="2" height="2" fill="#F2C14E" />
        ))}
      </g>
      <text className="font-pixel" fontSize="11" x="444" y="20" fill="#F2C14E">
        {stars}/{maxStars}
      </text>
      <rect x="520" y="11" width="140" height="10" fill="#33294D" />
      <rect x="520" y="11" width={Math.round(140 * progress)} height="10" fill="#4FBF8E" />

      {/* Profile: trophy cabinet */}
      <Station href={`${base}/profile`} label="Profile: badges, stars and progress" router={router}>
        <rect x="44" y="80" width="132" height="160" fill="#4A3226" />
        <rect x="52" y="88" width="116" height="144" fill="#2E1F17" />
        <rect x="52" y="140" width="116" height="6" fill="#6B4630" />
        <rect x="52" y="200" width="116" height="6" fill="#6B4630" />
        <rect x="68" y="112" width="20" height="16" fill="#F2C14E" />
        <rect x="74" y="128" width="8" height="6" fill="#C79A2E" />
        <rect x="70" y="134" width="16" height="6" fill="#C79A2E" />
        <rect x="104" y="116" width="16" height="12" fill="#C0C6D0" />
        <rect x="108" y="128" width="8" height="12" fill="#8A909B" />
        <rect x="136" y="114" width="16" height="16" fill="#C7773A" />
        <rect x="140" y="130" width="8" height="10" fill="#8E5126" />
        <rect x="66" y="176" width="16" height="16" fill="#4FBF8E" />
        <rect x="94" y="176" width="16" height="16" fill="#E0604A" />
        <rect x="122" y="176" width="16" height="16" fill="#5BA7E8" />
        <Plate x={54} width={112} text="Profile" />
      </Station>

      {/* Time-travel: portal */}
      <Station href={`${base}/time-travel`} label="Time-travel: the history of ideas" router={router}>
        <rect x="216" y="70" width="128" height="180" fill="#6E7382" />
        <rect x="216" y="70" width="128" height="8" fill="#9AA0AE" />
        <rect x="232" y="86" width="96" height="164" fill="#1E8FA3" />
        <rect className="anim-glow" x="244" y="98" width="72" height="152" fill="#39D0E0" />
        <rect className="anim-glow" x="264" y="110" width="32" height="140" fill="#9FF3F8" />
        <rect x="224" y="58" width="16" height="16" fill="#C7773A" />
        <rect x="320" y="58" width="16" height="16" fill="#C7773A" />
        <Plate x={216} width={128} text="Time-travel" />
      </Station>

      {/* Teaching room: chalkboard */}
      <Station href={`${base}/teaching-room`} label="Teaching room: teach Alex" router={router}>
        <rect x="380" y="86" width="132" height="96" fill="#8A5A34" />
        <rect x="388" y="94" width="116" height="80" fill="#2F5A40" />
        <rect x="400" y="108" width="40" height="4" fill="#E8F0E8" />
        <rect x="400" y="120" width="64" height="4" fill="#E8F0E8" />
        <rect x="400" y="132" width="28" height="4" fill="#E8F0E8" />
        <rect x="452" y="140" width="36" height="20" fill="none" stroke="#F2C14E" strokeWidth="4" />
        <rect x="404" y="204" width="88" height="14" fill="#7A4E2E" />
        <rect x="410" y="218" width="8" height="32" fill="#5A3A22" />
        <rect x="478" y="218" width="8" height="32" fill="#5A3A22" />
        <Plate x={378} width={136} text="Teaching" />
      </Station>

      {/* Assessment room: boss door */}
      <Station href={`${base}/assessment-room`} label={`Assessment room: week ${currentWeek} practical`} router={router}>
        <rect x="548" y="66" width="112" height="184" fill="#3A2A2A" />
        <rect x="560" y="82" width="88" height="168" fill="#8E2F2A" />
        <rect x="568" y="94" width="32" height="64" fill="#7A2723" />
        <rect x="608" y="94" width="32" height="64" fill="#7A2723" />
        <rect x="568" y="170" width="32" height="68" fill="#7A2723" />
        <rect x="608" y="170" width="32" height="68" fill="#7A2723" />
        <rect x="626" y="164" width="8" height="8" fill="#F2C14E" />
        <rect className="anim-glow" x="568" y="44" width="72" height="18" fill="#E0604A" />
        <text className="font-pixel" fontSize="9" x="604" y="58" textAnchor="middle" fill="#1A1428">
          Wk {currentWeek}
        </text>
        <Plate x={548} width={112} text="Assess" />
      </Station>

      {/* Alex */}
      <g className="anim-bob" aria-hidden>
        <rect x="332" y="300" width="32" height="8" fill="#3B2416" />
        <rect x="332" y="308" width="32" height="16" fill="#F2C29B" />
        <rect x="336" y="312" width="24" height="4" fill="#5BA7E8" />
        <rect x="340" y="316" width="4" height="4" fill="#1A1428" />
        <rect x="352" y="316" width="4" height="4" fill="#1A1428" />
        <rect x="328" y="324" width="40" height="16" fill="#C7773A" />
        <rect x="324" y="328" width="4" height="8" fill="#F2C29B" />
        <rect x="368" y="328" width="4" height="8" fill="#F2C29B" />
        <rect x="332" y="340" width="32" height="12" fill="#1F3550" />
        <rect x="332" y="352" width="12" height="4" fill="#1A1428" />
        <rect x="352" y="352" width="12" height="4" fill="#1A1428" />
      </g>
      <rect x="328" y="358" width="40" height="4" fill="#3E2A1C" />
      <rect x="380" y="292" width="164" height="28" fill="#F3EBDD" />
      <rect x="376" y="304" width="4" height="8" fill="#F3EBDD" />
      <text className="font-pixel" fontSize="11" x="462" y="310" textAnchor="middle" fill="#1A1428">
        Teach me?
      </text>
      <text className="font-pixel" fontSize="11" x="348" y="390" textAnchor="middle" fill="#F3EBDD">
        Alex
      </text>
    </svg>
  );
}

function Station({
  href,
  label,
  router,
  children,
}: {
  href: string;
  label: string;
  router: ReturnType<typeof useRouter>;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      className="station"
      onClick={(e: MouseEvent) => {
        e.preventDefault();
        router.push(href);
      }}
    >
      {children}
    </a>
  );
}

function Plate({ x, width, text }: { x: number; width: number; text: string }) {
  return (
    <>
      <rect className="pl" x={x} y="262" width={width} height="22" fill="#1A1428" />
      <text className="font-pixel" fontSize="11" x={x + width / 2} y="278" textAnchor="middle" fill="#F3EBDD">
        {text}
      </text>
    </>
  );
}
