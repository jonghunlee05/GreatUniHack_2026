import type { ReactNode } from "react";

const TONES = {
  dark: "bg-px-ink text-px-cream [--px-b:var(--px-night)]",
  cream: "bg-px-cream text-px-ink [--px-b:var(--px-ink)]",
  danger: "bg-[#3a1a22] text-px-cream [--px-b:var(--px-red)]",
} as const;

export function PixelPanel({
  tone = "dark",
  className = "",
  children,
}: {
  tone?: keyof typeof TONES;
  className?: string;
  children: ReactNode;
}) {
  return <div className={`px-frame p-5 ${TONES[tone]} ${className}`}>{children}</div>;
}

/** Cream speech bubble with a pixel tail on the left (Alex talking). */
export function SpeechBubble({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <span aria-hidden className="absolute -left-3 top-1/2 h-3 w-3 -translate-y-1/2 bg-px-cream" />
      <PixelPanel tone="cream" className="py-3">
        <p className="font-pixel text-[0.65rem] leading-relaxed">{children}</p>
      </PixelPanel>
    </div>
  );
}
