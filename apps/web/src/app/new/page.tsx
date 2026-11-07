"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Machine } from "@/components/pixel/Machine";
import { AlexSprite } from "@/components/pixel/AlexSprite";
import { PixelButton } from "@/components/pixel/PixelButton";
import { PixelPanel } from "@/components/pixel/PixelPanel";
import { StatusLog } from "@/components/pixel/StatusLog";
import { FileSprite } from "@/features/new-game/components/FileSprite";

const ACCEPTED = [".pdf", ".pptx", ".txt", ".md"];
const MAX_TOTAL_MB = 24;

const STATUS_MESSAGES = [
  "Reading your materials…",
  "Finding the big ideas…",
  "Building chapters…",
  "Travelling back in time for each era…",
  "Writing learning outcomes…",
  "Polishing the cartridge…",
];

type Phase = "forge" | "generating" | "failed";

const extOf = (name: string) => name.slice(name.lastIndexOf(".")).toLowerCase();

/** New game: the forge → generating → (failed | redirect to reveal). */
export default function NewGamePage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("forge");
  const [files, setFiles] = useState<File[]>([]);
  const [courseHint, setCourseHint] = useState("");
  const [dragging, setDragging] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const totalMb = files.reduce((s, f) => s + f.size, 0) / 1e6;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const bad = incoming.filter((f) => !ACCEPTED.includes(extOf(f.name)));
    const good = incoming.filter((f) => ACCEPTED.includes(extOf(f.name)));
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...good.filter((f) => !names.has(f.name))];
    });
    setFormError(
      bad.length
        ? `Alex can't read ${bad.map((f) => f.name).join(", ")}. Use PDF, .pptx, .txt or .md.`
        : null,
    );
  }

  async function generate() {
    if (files.length === 0) {
      setFormError("The hopper is empty. Add at least one file.");
      return;
    }
    if (totalMb > MAX_TOTAL_MB) {
      setFormError(`That's ${totalMb.toFixed(1)} MB. The machine takes up to ${MAX_TOTAL_MB} MB.`);
      return;
    }

    const body = new FormData();
    files.forEach((f) => body.append("files", f));
    body.append("courseHint", courseHint);

    setFormError(null);
    setFailure(null);
    setPhase("generating");
    try {
      const res = await fetch("/api/games", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      router.push(`/new/${data.id}`);
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "Something went wrong.");
      setPhase("failed");
    }
  }

  if (phase === "generating") {
    return (
      <div className="mx-auto max-w-2xl space-y-8 text-center">
        <h1 className="font-pixel text-lg leading-relaxed text-px-gold sm:text-xl">Forging your game…</h1>
        <div className="flex items-end justify-center gap-4">
          <Machine state="running" className="w-56 sm:w-64" />
          <AlexSprite mood="reading" className="h-24 w-auto" />
        </div>
        <IndeterminateBar />
        <StatusLog messages={STATUS_MESSAGES} />
        <p className="text-lg text-px-muted">This usually takes under a minute. Keep this tab open.</p>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="mx-auto max-w-2xl space-y-8 text-center">
        <h1 className="font-pixel text-lg leading-relaxed text-px-red sm:text-xl">The machine jammed</h1>
        <div className="flex items-end justify-center gap-4">
          <Machine state="broken" className="w-56 sm:w-64" />
          <AlexSprite mood="worried" className="h-24 w-auto" label="Alex looks worried" />
        </div>
        <PixelPanel tone="danger" className="text-left">
          <p role="alert" className="text-xl">
            {failure}
          </p>
        </PixelPanel>
        <div className="flex flex-wrap justify-center gap-5">
          <PixelButton onClick={generate}>Try again</PixelButton>
          <PixelButton variant="ghost" onClick={() => setPhase("forge")}>
            Change files
          </PixelButton>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <Link href="/" className="font-pixel text-[0.6rem] text-px-muted hover:text-px-gold">
          ← Back to games
        </Link>
        <h1 className="mt-4 font-pixel text-2xl leading-snug text-px-gold">The forge</h1>
        <p className="mt-2 text-xl text-px-muted">
          Drop your course materials into the hopper. The machine turns them into a game.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          generate();
        }}
        className="grid items-start gap-8 md:grid-cols-2"
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className="text-center"
        >
          <Machine state={dragging ? "hungry" : "idle"} className="mx-auto w-full max-w-sm" />
          <p className={`mt-2 text-xl ${dragging ? "text-px-gold" : "text-px-muted"}`}>
            {dragging ? "Drop it in!" : "Drag files onto the machine"}
          </p>
        </div>

        <PixelPanel className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <PixelButton variant="ghost" onClick={() => inputRef.current?.click()}>
              Choose files
            </PixelButton>
            <span className="text-lg text-px-muted">PDF, .pptx, .txt, .md · up to {MAX_TOTAL_MB} MB</span>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPTED.join(",")}
              aria-label="Course materials"
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {files.length === 0 ? (
            <p className="text-lg text-px-muted">No files yet. The hopper is empty.</p>
          ) : (
            <ul className="space-y-2" aria-label="Files to upload">
              {files.map((f) => (
                <li key={f.name} className="flex items-center gap-3">
                  <FileSprite name={f.name} className="h-6 w-5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-xl">{f.name}</span>
                  <span className="shrink-0 text-lg text-px-muted">{(f.size / 1e6).toFixed(1)} MB</span>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((x) => x.name !== f.name))}
                    aria-label={`Remove ${f.name}`}
                    className="shrink-0 px-2 font-pixel text-[0.6rem] text-px-red hover:text-px-gold"
                  >
                    X
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label className="block">
            <span className="text-lg text-px-muted">What is this course? (optional)</span>
            <input
              type="text"
              value={courseHint}
              onChange={(e) => setCourseHint(e.target.value)}
              maxLength={300}
              placeholder="e.g. 2nd-year PCB design, EEE"
              className="px-input px-frame mt-2"
            />
          </label>

          {formError && (
            <PixelPanel tone="danger" className="py-3">
              <p role="alert" className="text-lg">
                {formError}
              </p>
            </PixelPanel>
          )}

          <PixelButton type="submit" size="lg" className="w-full" disabled={files.length === 0}>
            Start the machine
          </PixelButton>
        </PixelPanel>
      </form>
    </div>
  );
}

/** Moving bar with no percentage: we don't know how far along the generator is. */
function IndeterminateBar() {
  return (
    <div
      role="progressbar"
      aria-label="Generating your game"
      className="px-frame relative h-6 overflow-hidden bg-px-night [--px-b:var(--px-ink)]"
    >
      <div
        className="anim-slide absolute inset-y-1 left-0 w-2/5"
        style={{
          background: "repeating-linear-gradient(to right, var(--px-mint) 0 12px, transparent 12px 16px)",
        }}
      />
    </div>
  );
}
