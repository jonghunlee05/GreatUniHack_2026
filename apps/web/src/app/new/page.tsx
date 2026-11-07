"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const ACCEPT = ".pdf,.pptx,.txt,.md";
const MAX_TOTAL_MB = 24;

export default function NewGamePage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [courseHint, setCourseHint] = useState("");
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "generating">("idle");
  const [error, setError] = useState<string | null>(null);

  const totalMb = files.reduce((s, f) => s + f.size, 0) / 1e6;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...incoming.filter((f) => !names.has(f.name))];
    });
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) {
      setError("Add at least one file.");
      return;
    }
    if (totalMb > MAX_TOTAL_MB) {
      setError(`Files total ${totalMb.toFixed(1)} MB; the limit is ${MAX_TOTAL_MB} MB.`);
      return;
    }

    const body = new FormData();
    files.forEach((f) => body.append("files", f));
    body.append("courseHint", courseHint);

    setStatus("generating");
    setError(null);
    try {
      const res = await fetch("/api/games", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      router.push(`/games/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("idle");
    }
  }

  const generating = status === "generating";

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">New game</h1>
        <p className="mt-1 text-muted">
          Upload your course materials. The game generator maps the course into chapters and
          writes the learning outcomes for each week.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div
          role="button"
          tabIndex={0}
          onClick={() => !generating && inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !generating) inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!generating) addFiles(e.dataTransfer.files);
          }}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition ${
            dragging ? "border-mint-ink bg-mint" : "border-line bg-paper hover:border-mint-ink"
          }`}
        >
          <p className="font-medium">Drop files here or click to browse</p>
          <p className="mt-1 text-sm text-muted">
            PDF, slides (.pptx), notes (.txt, .md) · up to {MAX_TOTAL_MB} MB total
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {files.length > 0 && (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {files.map((f) => (
              <li key={f.name} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{f.name}</p>
                  <p className="text-xs text-muted">{(f.size / 1e6).toFixed(2)} MB</p>
                </div>
                <button
                  type="button"
                  disabled={generating}
                  onClick={() => setFiles((prev) => prev.filter((x) => x.name !== f.name))}
                  className="text-sm text-muted hover:text-foreground disabled:opacity-40"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="block">
          <span className="text-sm font-medium">What is this course? (optional)</span>
          <input
            type="text"
            value={courseHint}
            onChange={(e) => setCourseHint(e.target.value)}
            disabled={generating}
            maxLength={300}
            placeholder="e.g. 2nd-year PCB design, EEE"
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-mint-ink"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={generating || files.length === 0}
          className="w-full rounded-lg bg-mint-ink px-4 py-3 font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {generating ? "Generating your game… this can take a minute or two" : "Generate game"}
        </button>
      </form>
    </div>
  );
}
