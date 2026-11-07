export type MachineState = "idle" | "hungry" | "running" | "broken" | "done";

/**
 * The forge machine: hopper on top, screen, gears, status lights, output slot.
 * hungry = files being dragged over it, running = generating,
 * broken = generation failed, done = game ready.
 */
export function Machine({
  state = "idle",
  className = "",
}: {
  state?: MachineState;
  className?: string;
}) {
  const running = state === "running";
  const hopper = state === "hungry" ? "#F2C14E" : "#6E7382";
  const hopperRim = state === "hungry" ? "#FFE08A" : "#9AA0AE";
  const screen =
    state === "broken" ? "#5A1F24" : state === "done" ? "#1F6B4E" : "#1E8FA3";
  const screenGlow =
    state === "broken" ? "#E0604A" : state === "done" ? "#4FBF8E" : "#39D0E0";
  const lights =
    state === "done"
      ? ["#4FBF8E", "#4FBF8E", "#4FBF8E"]
      : state === "broken"
        ? ["#E0604A", "#E0604A", "#E0604A"]
        : ["#E0604A", "#F2C14E", "#4FBF8E"];

  return (
    <svg viewBox="0 0 200 210" shapeRendering="crispEdges" className={className} aria-hidden>
      {/* smoke when broken */}
      {state === "broken" && (
        <g fill="#9AA0AE">
          <rect className="anim-puff" x="84" y="0" width="16" height="12" />
          <rect className="anim-puff" x="100" y="4" width="20" height="12" style={{ animationDelay: "0.4s" }} />
          <rect className="anim-puff" x="72" y="6" width="12" height="8" style={{ animationDelay: "0.8s" }} />
        </g>
      )}

      {/* hopper */}
      <rect x="56" y="16" width="88" height="8" fill={hopperRim} />
      <rect x="60" y="24" width="80" height="8" fill={hopper} />
      <rect x="68" y="32" width="64" height="8" fill={hopper} />
      <rect x="76" y="40" width="48" height="8" fill={hopper} />
      <rect x="86" y="48" width="28" height="12" fill={hopper} />
      <rect x="64" y="24" width="72" height="4" fill="#1A1428" opacity="0.35" />

      {/* body */}
      <rect x="24" y="60" width="152" height="124" fill="#4A3226" />
      <rect x="32" y="68" width="136" height="108" fill="#6E7382" />
      <rect x="32" y="68" width="136" height="4" fill="#9AA0AE" />

      {/* screen */}
      <rect x="44" y="80" width="64" height="40" fill={screen} />
      <rect className={running ? "anim-glow" : undefined} x="50" y="86" width="52" height="28" fill={screenGlow} opacity="0.8" />
      {state === "broken" && (
        <g fill="#1A1428">
          <rect x="68" y="92" width="4" height="4" />
          <rect x="80" y="92" width="4" height="4" />
          <rect x="72" y="96" width="8" height="4" />
          <rect x="68" y="100" width="4" height="4" />
          <rect x="80" y="100" width="4" height="4" />
        </g>
      )}

      {/* gears */}
      <Gear cx={140} cy={92} className={running ? "anim-spin" : undefined} />
      <Gear cx={124} cy={124} small className={running ? "anim-spin-rev" : undefined} />

      {/* status lights */}
      {lights.map((fill, i) => (
        <rect
          key={i}
          className={running || state === "broken" ? "anim-blink" : undefined}
          style={{ animationDelay: `${i * 0.27}s` }}
          x={44 + i * 16}
          y={136}
          width={10}
          height={10}
          fill={fill}
        />
      ))}
      <rect x="96" y="134" width="14" height="14" fill="#C79A2E" />
      <rect x="101" y="137" width="4" height="6" fill="#1A1428" />

      {/* output slot */}
      <rect x="104" y="158" width="56" height="10" fill="#120E1E" />
      <rect x="104" y="168" width="56" height="2" fill="#9AA0AE" />

      {/* feet */}
      <rect x="36" y="184" width="20" height="12" fill="#4A3226" />
      <rect x="144" y="184" width="20" height="12" fill="#4A3226" />
      <rect x="20" y="196" width="160" height="4" fill="#1A1428" opacity="0.5" />
    </svg>
  );
}

function Gear({ cx, cy, small, className }: { cx: number; cy: number; small?: boolean; className?: string }) {
  const s = small ? 0.7 : 1;
  const r = (n: number) => Math.round(n * s);
  return (
    <g className={className} fill="#C79A2E">
      <rect x={cx - r(4)} y={cy - r(16)} width={r(8)} height={r(32)} />
      <rect x={cx - r(16)} y={cy - r(4)} width={r(32)} height={r(8)} />
      <rect x={cx - r(13)} y={cy - r(13)} width={r(6)} height={r(6)} />
      <rect x={cx + r(7)} y={cy - r(13)} width={r(6)} height={r(6)} />
      <rect x={cx - r(13)} y={cy + r(7)} width={r(6)} height={r(6)} />
      <rect x={cx + r(7)} y={cy + r(7)} width={r(6)} height={r(6)} />
      <rect x={cx - r(10)} y={cy - r(10)} width={r(20)} height={r(20)} />
      <rect x={cx - r(3)} y={cy - r(3)} width={r(6)} height={r(6)} fill="#4A3226" />
    </g>
  );
}
