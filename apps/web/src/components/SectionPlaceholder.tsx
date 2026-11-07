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
        <h2 className={`text-2xl font-semibold ${tone.ink}`}>{section.name}</h2>
        <p className="mt-1 text-muted">{section.tagline}</p>
      </div>
      <div className={`rounded-xl border-2 border-dashed p-8 ${tone.card}`}>
        <p className={`text-sm font-semibold uppercase tracking-wide ${tone.ink}`}>
          Coming soon
        </p>
        <ul className={`mt-3 list-disc space-y-1 pl-5 ${tone.ink}`}>
          {planned.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
