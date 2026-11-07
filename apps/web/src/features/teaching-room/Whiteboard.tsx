"use client";

import { useRef, useState, type PointerEvent } from "react";
import { PixelButton } from "@/components/pixel/PixelButton";

export type ImageSubmission = { base64: string; mediaType: string; note: string };

const W = 560;
const H = 320;

/** Draw on a pixel whiteboard or upload an image, plus an optional explanation. */
export function Whiteboard({ disabled, onSubmit }: { disabled: boolean; onSubmit: (image: ImageSubmission) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [upload, setUpload] = useState<{ base64: string; mediaType: string; url: string } | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * W, y: ((event.clientY - rect.top) / rect.height) * H };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    if (!dirty) {
      ctx.fillStyle = "#f3ebdd";
      ctx.fillRect(0, 0, W, H);
    }
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const { x, y } = point(event);
    ctx.strokeStyle = "#1a1428";
    ctx.lineWidth = 4;
    ctx.lineCap = "square";
    ctx.beginPath();
    ctx.moveTo(x, y);
    setDirty(true);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = point(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function clear() {
    canvas.current?.getContext("2d")?.clearRect(0, 0, W, H);
    setDirty(false);
    setUpload(null);
  }

  function choose(file: File | undefined) {
    setError("");
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) return setError("Use PNG, JPEG, WebP or GIF.");
    if (file.size > 5 * 1024 * 1024) return setError("Images must be under 5 MB.");
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setUpload({ base64: url.split(",")[1] ?? "", mediaType: file.type, url });
    };
    reader.readAsDataURL(file);
  }

  function submit() {
    if (upload) onSubmit({ base64: upload.base64, mediaType: upload.mediaType, note: note.trim() });
    else if (dirty && canvas.current) {
      const url = canvas.current.toDataURL("image/png");
      onSubmit({ base64: url.split(",")[1] ?? "", mediaType: "image/png", note: note.trim() });
    }
    setNote("");
    clear();
  }

  return (
    <div className="space-y-3">
      {upload ? (
        // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
        <img src={upload.url} alt="Uploaded teaching image" className="max-h-64 border-4 border-px-ink" />
      ) : (
        <canvas
          ref={canvas}
          width={W}
          height={H}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={() => (drawing.current = false)}
          onPointerLeave={() => (drawing.current = false)}
          className="w-full touch-none border-4 border-px-ink bg-px-cream"
          style={{ aspectRatio: `${W} / ${H}`, imageRendering: "pixelated", cursor: "crosshair" }}
          aria-label="Whiteboard: draw a diagram for Alex"
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className="px-btn px-btn--ghost cursor-pointer">
          Upload image
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
        </label>
        <PixelButton variant="ghost" onClick={clear}>Clear</PixelButton>
      </div>
      {error && <p className="text-px-red">{error}</p>}
      <input value={note} onChange={(e) => setNote(e.target.value)} className="px-input px-frame" placeholder="What does your drawing show? (recommended)" />
      <PixelButton disabled={disabled || (!dirty && !upload)} onClick={submit}>Show Alex</PixelButton>
    </div>
  );
}
