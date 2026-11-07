const HAIR = ["#3B2416", "#1A1428", "#8E5126", "#C0C6D0", "#6B4630", "#2E1F17"];
const COAT = ["#2F3E5C", "#5A1E1A", "#2F5A40", "#4A3226", "#3A2A4A", "#1F3550"];
const SKIN = ["#F2C29B", "#E0A878", "#C68A5E", "#8D5A3B"];

function hash(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * Simple pixel portrait for a historical cast member.
 * Colours are picked from the name so the same person always looks the same.
 * These are stylised sprites, not likenesses.
 */
export function Portrait({ name, className = "" }: { name: string; className?: string }) {
  const h = hash(name);
  const hair = HAIR[h % HAIR.length];
  const coat = COAT[(h >> 3) % COAT.length];
  const skin = SKIN[(h >> 6) % SKIN.length];
  const beard = (h >> 9) % 3 === 0;
  const collar = (h >> 11) % 2 === 0 ? "#F3EBDD" : "#C79A2E";

  return (
    <svg viewBox="0 0 16 18" shapeRendering="crispEdges" className={className} role="img" aria-label={`Portrait of ${name}`}>
      <rect x="4" y="1" width="8" height="3" fill={hair} />
      <rect x="3" y="3" width="2" height="4" fill={hair} />
      <rect x="11" y="3" width="2" height="4" fill={hair} />
      <rect x="5" y="4" width="6" height="6" fill={skin} />
      <rect x="6" y="6" width="1" height="1" fill="#1A1428" />
      <rect x="9" y="6" width="1" height="1" fill="#1A1428" />
      {beard ? (
        <rect x="5" y="8" width="6" height="2" fill={hair} />
      ) : (
        <rect x="7" y="8" width="2" height="1" fill="#8E5126" />
      )}
      <rect x="2" y="11" width="12" height="7" fill={coat} />
      <rect x="6" y="10" width="4" height="2" fill={collar} />
    </svg>
  );
}
