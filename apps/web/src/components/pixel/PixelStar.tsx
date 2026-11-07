/** 7×7 pixel star (the pixel font has no ★ glyph). */
export const STAR_PIXELS: [number, number][] = [
  [3, 0],
  [3, 1],
  [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2],
  [1, 3], [2, 3], [3, 3], [4, 3], [5, 3],
  [2, 4], [3, 4], [4, 4],
  [1, 5], [2, 5], [4, 5], [5, 5],
  [0, 6], [1, 6], [5, 6], [6, 6],
];

export function PixelStar({ className = "", fill = "currentColor" }: { className?: string; fill?: string }) {
  return (
    <svg viewBox="0 0 7 7" shapeRendering="crispEdges" className={className} aria-hidden>
      {STAR_PIXELS.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={fill} />
      ))}
    </svg>
  );
}
