type Mood = "idle" | "reading" | "worried";

/**
 * Alex, the AI apprentice, as a 48×66 pixel sprite (same art as the lobby).
 * Decorative by default; pass `label` when the sprite carries meaning.
 */
export function AlexSprite({
  mood = "idle",
  className = "",
  label,
}: {
  mood?: Mood;
  className?: string;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 66"
      shapeRendering="crispEdges"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <rect x="4" y="62" width="40" height="4" fill="#3E2A1C" opacity="0.6" />
      <g className={mood === "worried" ? undefined : "anim-bob"}>
        {/* hair, face, glasses band, eyes */}
        <rect x="8" y="4" width="32" height="8" fill="#3B2416" />
        <rect x="8" y="12" width="32" height="16" fill="#F2C29B" />
        <rect x="12" y="16" width="24" height="4" fill="#5BA7E8" />
        <rect x="16" y="20" width="4" height="4" fill="#1A1428" />
        <rect x="28" y="20" width="4" height="4" fill="#1A1428" />
        {/* body, hands, legs, shoes */}
        <rect x="4" y="28" width="40" height="16" fill="#C7773A" />
        <rect x="0" y="32" width="4" height="8" fill="#F2C29B" />
        <rect x="44" y="32" width="4" height="8" fill="#F2C29B" />
        <rect x="8" y="44" width="32" height="12" fill="#1F3550" />
        <rect x="8" y="56" width="12" height="4" fill="#1A1428" />
        <rect x="28" y="56" width="12" height="4" fill="#1A1428" />

        {mood === "worried" && (
          <>
            <rect x="20" y="25" width="8" height="2" fill="#1A1428" />
            <rect className="anim-blink" x="42" y="10" width="4" height="6" fill="#5BA7E8" />
          </>
        )}

        {mood === "reading" && (
          <g>
            <rect x="8" y="30" width="32" height="14" fill="#8E2F2A" />
            <rect x="10" y="32" width="13" height="10" fill="#F3EBDD" />
            <rect x="25" y="32" width="13" height="10" fill="#F3EBDD" />
            <rect x="23" y="30" width="2" height="14" fill="#5A1E1A" />
            <rect className="anim-flip" x="25" y="32" width="13" height="10" fill="#E2D6C0" />
            <rect x="12" y="35" width="9" height="1" fill="#A79FBF" />
            <rect x="12" y="38" width="7" height="1" fill="#A79FBF" />
          </g>
        )}
      </g>
    </svg>
  );
}
