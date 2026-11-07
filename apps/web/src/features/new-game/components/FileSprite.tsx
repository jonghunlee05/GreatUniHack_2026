/** Tiny pixel icon for an uploaded file: red book (PDF), copper deck (slides), scroll (notes). */
export function FileSprite({ name, className = "" }: { name: string; className?: string }) {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();

  if (ext === ".pdf") {
    return (
      <svg viewBox="0 0 10 12" shapeRendering="crispEdges" className={className} aria-hidden>
        <rect x="1" y="0" width="8" height="12" fill="#8E2F2A" />
        <rect x="1" y="0" width="2" height="12" fill="#5A1E1A" />
        <rect x="4" y="3" width="4" height="1" fill="#F2C14E" />
        <rect x="4" y="5" width="3" height="1" fill="#F2C14E" />
      </svg>
    );
  }
  if (ext === ".pptx") {
    return (
      <svg viewBox="0 0 10 12" shapeRendering="crispEdges" className={className} aria-hidden>
        <rect x="2" y="0" width="8" height="9" fill="#8E5126" />
        <rect x="0" y="2" width="8" height="9" fill="#C7773A" />
        <rect x="1" y="4" width="6" height="1" fill="#F3EBDD" />
        <rect x="1" y="6" width="4" height="1" fill="#F3EBDD" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 10 12" shapeRendering="crispEdges" className={className} aria-hidden>
      <rect x="0" y="0" width="10" height="2" fill="#C79A2E" />
      <rect x="1" y="2" width="8" height="8" fill="#F3EBDD" />
      <rect x="0" y="10" width="10" height="2" fill="#C79A2E" />
      <rect x="2" y="4" width="6" height="1" fill="#A79FBF" />
      <rect x="2" y="6" width="5" height="1" fill="#A79FBF" />
    </svg>
  );
}
