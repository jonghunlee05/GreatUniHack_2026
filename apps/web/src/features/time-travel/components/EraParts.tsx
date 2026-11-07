"use client";

import { useState } from "react";
import type { Clue } from "@/lib/chapter-pack";
import type { ClientSource } from "../progress";
import type { Skin } from "../skins";
import { PixelButton } from "@/components/pixel/PixelButton";
import { Portrait } from "./Portrait";

/** One line of dramatised dialogue, with the speaker's portrait. */
export function DialogueBox({ speaker, line, skin }: { speaker: string; line: string; skin: Skin }) {
  return (
    <div className="flex items-start gap-3">
      <Portrait name={speaker} className="h-12 w-auto shrink-0" />
      <div className="px-frame flex-1 p-3 [--px-b:var(--px-ink)]" style={{ background: skin.panel, color: skin.ink }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-pixel text-[0.55rem]">{speaker}</span>
          <span
            className="border-2 px-1 font-pixel text-[0.45rem] uppercase"
            style={{ borderColor: skin.ink, opacity: 0.7 }}
            title="Dramatised paraphrase, not a real quote"
          >
            Dramatised
          </span>
        </div>
        <p className="mt-1 text-xl leading-snug">{line}</p>
      </div>
    </div>
  );
}

export function sourceLabel(clue: Clue, sources: Record<string, ClientSource>): string | null {
  if (clue.type !== "course_material" || !clue.source_id) return null;
  const src = sources[clue.source_id];
  if (!src) return `Course material (${clue.source_id})`;
  return src.page ? `${src.file}, p. ${src.page}` : src.file;
}

/** A clue in the scene. Clicking collects it into the logbook. */
export function ClueCard({
  clue,
  collected,
  highlighted,
  sources,
  onCollect,
  disabled,
}: {
  clue: Clue;
  collected: boolean;
  highlighted: boolean;
  sources: Record<string, ClientSource>;
  onCollect: () => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(collected);
  const source = sourceLabel(clue, sources);
  const isCourse = clue.type === "course_material";

  return (
    <button
      type="button"
      onClick={() => {
        setOpen(true);
        if (!collected) onCollect();
      }}
      disabled={disabled && !collected}
      aria-pressed={collected}
      aria-label={`${collected ? "Collected clue" : "Inspect clue"}: ${clue.title}`}
      className={`lift px-frame block w-full p-3 text-left hover:-translate-y-1 ${
        isCourse ? "bg-[#1f3b3e]" : "bg-px-wall-line"
      } ${highlighted ? "anim-glow [--px-b:var(--px-gold)]" : collected ? "[--px-b:var(--px-mint)]" : "[--px-b:var(--px-ink)]"}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-pixel text-[0.55rem] leading-relaxed text-px-gold">
          {isCourse ? "Course material" : "Clue"} · {clue.title}
        </span>
        <span className={`font-pixel text-[0.5rem] ${collected ? "text-px-mint" : "text-px-muted"}`}>
          {collected ? "In logbook" : "Inspect"}
        </span>
      </span>
      {open && <span className="mt-2 block text-lg leading-snug">{clue.text}</span>}
      {open && source && <span className="mt-1 block text-base text-px-muted">Source: {source}</span>}
    </button>
  );
}

/** Collected clues, across all scenes. */
export function Logbook({
  clues,
  collectedIds,
  highlightedId,
  sources,
}: {
  clues: Clue[];
  collectedIds: string[];
  highlightedId: string | null;
  sources: Record<string, ClientSource>;
}) {
  const collected = collectedIds
    .map((id) => clues.find((c) => c.id === id))
    .filter((c): c is Clue => Boolean(c));

  return (
    <section aria-label="Logbook" className="px-frame space-y-3 bg-px-ink p-4 [--px-b:var(--px-night)]">
      <h3 className="font-pixel text-[0.65rem] text-px-gold">
        Logbook · {collected.length}/{clues.length}
      </h3>
      {collected.length === 0 ? (
        <p className="text-lg text-px-muted">Inspect clues in each scene to collect them here.</p>
      ) : (
        <ul className="space-y-3">
          {collected.map((c) => {
            const source = sourceLabel(c, sources);
            return (
              <li
                key={c.id}
                className={`border-l-4 pl-3 ${c.id === highlightedId ? "anim-glow border-px-gold" : "border-px-mint"}`}
              >
                <p className="font-pixel text-[0.5rem] leading-relaxed text-px-cream">{c.title}</p>
                <p className="text-lg leading-snug text-px-muted">{c.text}</p>
                {source && <p className="text-base text-px-blue">{source}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Scene 3: the mentor's question. */
export function MentorPanel({
  askedBy,
  question,
  passed,
  hints,
  mcqOptions,
  message,
  busy,
  skin,
  onAnswer,
  onChoose,
}: {
  askedBy: string;
  question: string;
  passed: boolean;
  hints: string[];
  mcqOptions: string[] | null;
  message: { tone: "good" | "info" | "bad"; text: string } | null;
  busy: boolean;
  skin: Skin;
  onAnswer: (text: string) => void;
  onChoose: (index: number) => void;
}) {
  const [text, setText] = useState("");
  const [choice, setChoice] = useState<number | null>(null);

  return (
    <section aria-label="Mentor question" className="px-frame space-y-4 bg-px-ink p-4 [--px-b:var(--px-gold)]">
      <div className="flex items-start gap-3">
        <Portrait name={askedBy} className="h-14 w-auto shrink-0" />
        <div className="px-frame flex-1 p-3 [--px-b:var(--px-ink)]" style={{ background: skin.panel, color: skin.ink }}>
          <p className="font-pixel text-[0.55rem]">{askedBy} asks</p>
          <p className="mt-1 text-xl leading-snug">{question}</p>
        </div>
      </div>

      {hints.length > 0 && (
        <ul className="space-y-1" aria-label="Hints">
          {hints.map((h, i) => (
            <li key={i} className="text-lg text-px-gold">
              Hint {i + 1}: {h}
            </li>
          ))}
        </ul>
      )}

      {message && (
        <p
          role="status"
          className={`text-xl ${message.tone === "good" ? "text-px-mint" : message.tone === "bad" ? "text-px-red" : "text-px-cream"}`}
        >
          {message.text}
        </p>
      )}

      {passed ? null : mcqOptions ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (choice !== null) onChoose(choice);
          }}
          className="space-y-3"
        >
          <fieldset className="space-y-2">
            <legend className="text-lg text-px-muted">Pick the best answer:</legend>
            {mcqOptions.map((opt, i) => (
              <label key={i} className="flex cursor-pointer items-start gap-3 text-lg">
                <input
                  type="radio"
                  name="mcq"
                  checked={choice === i}
                  onChange={() => setChoice(i)}
                  className="mt-1.5 accent-[var(--px-gold)]"
                />
                <span>{opt}</span>
              </label>
            ))}
          </fieldset>
          <PixelButton type="submit" disabled={busy || choice === null}>
            Answer
          </PixelButton>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) onAnswer(text.trim());
          }}
          className="space-y-3"
        >
          <label className="block">
            <span className="text-lg text-px-muted">Your answer, in your own words</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={1500}
              className="px-input px-frame mt-2 resize-y"
            />
          </label>
          <PixelButton type="submit" disabled={busy || !text.trim()}>
            {busy ? "Checking…" : "Answer"}
          </PixelButton>
        </form>
      )}
    </section>
  );
}
