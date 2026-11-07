import { getSection, TONE_CLASSES, type SectionSlug } from "@/lib/sections";

/** Temporary "coming soon" body for a section. Replace it when the section is built. */
export function SectionPlaceholder({
  slug,
  planned,
}: {
  slug: SectionSlug;
  planned: string[];
}) {
  const section = getSection(slug);
  const tone = TONE_CLASSES[section.tone];

  return (
    <div className="space-y-6">
      <div>
        <h2 className={`font-pixel text-lg leading-relaxed ${tone.ink}`}>{section.name}</h2>
        <p className="mt-2 text-xl text-px-muted">{section.tagline}</p>
      </div>
      <div className={`px-frame bg-px-ink p-6 ${tone.card}`}>
        <p className={`font-pixel text-[0.65rem] ${tone.ink}`}>Coming soon</p>
        <ul className="mt-4 space-y-2 text-xl">
          {planned.map((item) => (
            <li key={item}>▸ {item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
