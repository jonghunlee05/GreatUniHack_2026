"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Experiment, MentorChat } from "@/lib/chapter-pack";
import type { Skin } from "../skins";
import { PixelButton } from "@/components/pixel/PixelButton";
import { Portrait } from "./Portrait";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------------------
// Typewriter: reveals text letter by letter; click to finish. Screen readers get the full text.
// ---------------------------------------------------------------------------
export function Typewriter({ text, delay = 0 }: { text: string; delay?: number }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let i = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      if (prefersReducedMotion()) {
        setShown(text.length);
        return;
      }
      interval = setInterval(() => {
        i += 2;
        setShown(Math.min(i, text.length));
        if (i >= text.length) clearInterval(interval);
      }, 24);
    }, delay);
    return () => {
      clearTimeout(start);
      if (interval) clearInterval(interval);
    };
  }, [text, delay]);

  return (
    <span onClick={() => setShown(text.length)} className="cursor-default">
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.slice(0, shown)}
        {shown < text.length && <span className="anim-blink">▌</span>}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Warp: the year counter rolls back from today to the era when you enter.
// ---------------------------------------------------------------------------
export function WarpIntro({ year, place }: { year: string; place: string }) {
  const target = Number(year.match(/\b(1[0-9]{3}|20[0-9]{2})\b/)?.[1] ?? NaN);
  const [count, setCount] = useState(2026);
  const [done, setDone] = useState(!Number.isFinite(target));
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    const duration = prefersReducedMotion() ? 0 : 1300;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = duration ? Math.min(1, (now - t0) / duration) : 1;
      setCount(Math.round(2026 - (2026 - target) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    const hide = setTimeout(() => setDone(true), duration + 700);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      clearTimeout(hide);
    };
  }, [target]);

  if (done) return null;
  return (
    <div
      role="status"
      aria-label={`Travelling to ${place}, ${year}`}
      className="anim-warp fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-px-night"
    >
      <div
        aria-hidden
        className="anim-stripes absolute inset-0 opacity-30"
        style={{ background: "repeating-linear-gradient(to bottom, var(--px-violet) 0 4px, transparent 4px 16px)" }}
      />
      <p className="relative font-pixel text-[0.6rem] text-px-muted">Travelling back to</p>
      <p className="relative font-pixel text-5xl text-px-gold sm:text-6xl">{count}</p>
      <p className="relative text-2xl text-px-cream">{place}</p>
      <button
        type="button"
        onClick={() => setDone(true)}
        className="relative font-pixel text-[0.55rem] text-px-muted hover:text-px-gold"
      >
        Skip
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mentor chat: pick a question to ask the lead; they reply with a nudge.
// ---------------------------------------------------------------------------
export function MentorChatPanel({ chat, askedBy, skin }: { chat: MentorChat; askedBy: string; skin: Skin }) {
  const [asked, setAsked] = useState<number[]>([]);

  return (
    <section aria-label={`Ask ${askedBy}`} className="px-frame space-y-3 bg-px-ink p-4 [--px-b:var(--px-violet)]">
      <p className="font-pixel text-[0.55rem] text-px-violet">Ask {askedBy}</p>
      <div className="flex flex-wrap gap-3">
        {chat.options.map((o, i) => (
          <button
            key={i}
            type="button"
            disabled={asked.includes(i)}
            onClick={() => setAsked((a) => [...a, i])}
            className="px-frame m-1 bg-px-wall-line px-3 py-2 text-left text-lg [--px-b:var(--px-ink)] hover:text-px-gold disabled:opacity-50"
          >
            “{o.ask}”
          </button>
        ))}
      </div>
      {asked.map((i) => (
        <div key={i} className="flex items-start gap-3">
          <Portrait name={askedBy} pose="think" className="h-10 w-auto shrink-0" />
          <div className="px-frame flex-1 p-3 [--px-b:var(--px-ink)]" style={{ background: skin.panel, color: skin.ink }}>
            <p className="font-pixel text-[0.5rem]">
              {askedBy} <span className="opacity-60">· dramatised</span>
            </p>
            <p className="mt-1 text-xl leading-snug">
              <Typewriter text={chat.options[i].reply} />
            </p>
          </div>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Experiment: predict first, then try it, then see what happened.
// ---------------------------------------------------------------------------
type Phase = "predict" | "explore" | "reveal";

export function ExperimentPanel({
  experiment,
  done,
  onDone,
}: {
  experiment: Experiment;
  done: boolean;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(done ? "reveal" : experiment.prediction ? "predict" : "explore");
  const [prediction, setPrediction] = useState<number | null>(null);
  const finish = () => {
    setPhase("reveal");
    if (!done) onDone();
  };

  return (
    <section aria-label={`Experiment: ${experiment.title}`} className="px-frame space-y-4 bg-px-ink p-5 [--px-b:var(--px-teal,#39D0E0)]">
      <div>
        <p className="font-pixel text-[0.55rem] text-[#39D0E0]">Experiment</p>
        <h3 className="mt-1 font-pixel text-[0.7rem] leading-relaxed text-px-cream">{experiment.title}</h3>
        <p className="mt-2 text-xl leading-snug">{experiment.prompt}</p>
      </div>

      {phase === "predict" && experiment.prediction && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (prediction !== null) setPhase("explore");
          }}
          className="space-y-3"
        >
          <fieldset className="space-y-2">
            <legend className="text-lg text-px-gold">First, predict: {experiment.prediction.question}</legend>
            {experiment.prediction.options.map((opt, i) => (
              <label key={i} className="flex cursor-pointer items-start gap-3 text-lg">
                <input type="radio" name="prediction" checked={prediction === i} onChange={() => setPrediction(i)} className="mt-1.5" />
                <span>{opt}</span>
              </label>
            ))}
          </fieldset>
          <PixelButton type="submit" disabled={prediction === null}>
            Lock in prediction
          </PixelButton>
        </form>
      )}

      {phase === "explore" && <Template experiment={experiment} onFinish={finish} />}

      {phase === "reveal" && (
        <div className="space-y-2">
          {experiment.prediction && prediction !== null && (
            <p className={`text-lg ${prediction === experiment.prediction.correct_index ? "text-px-mint" : "text-px-gold"}`}>
              You predicted: “{experiment.prediction.options[prediction]}”{" "}
              {prediction === experiment.prediction.correct_index ? "Spot on." : "Not quite, and that's how discoveries start."}
            </p>
          )}
          <p className="px-frame bg-[#173d30] p-3 text-xl leading-snug [--px-b:var(--px-mint)]">{experiment.reveal}</p>
        </div>
      )}
    </section>
  );
}

function Template({ experiment, onFinish }: { experiment: Experiment; onFinish: () => void }) {
  const d = experiment.data as Record<string, unknown>;
  switch (experiment.template) {
    case "slider":
      return <SliderTemplate d={d} onFinish={onFinish} />;
    case "sort":
      return <SortTemplate d={d} onFinish={onFinish} />;
    case "order":
      return <OrderTemplate d={d} onFinish={onFinish} />;
    case "match":
      return <MatchTemplate d={d} onFinish={onFinish} />;
    case "numeric":
      return <NumericTemplate d={d} onFinish={onFinish} />;
  }
}

/** Deterministic shuffle so the server and browser render the same order. */
function shuffled<T>(items: T[]): T[] {
  return items
    .map((item, i) => ({ item, k: (i * 7919 + 13) % 101 }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.item);
}

function SliderTemplate({ d, onFinish }: { d: Record<string, unknown>; onFinish: () => void }) {
  const min = d.min as number;
  const max = d.max as number;
  const threshold = d.threshold as number;
  const [value, setValue] = useState(min);
  const [moved, setMoved] = useState(false);
  const above = value > threshold;
  const step = (max - min) / 100;
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-lg text-px-muted">
          {d.label as string}: <span className="font-pixel text-[0.65rem] text-px-cream">{Number(value.toPrecision(3))} {d.unit as string}</span>
        </span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            setValue(Number(e.target.value));
            setMoved(true);
          }}
          className="mt-2 w-full accent-[var(--px-gold)]"
        />
      </label>

      {d.visual === "flow" ? (
        <svg viewBox="0 0 200 30" shapeRendering="crispEdges" className="block w-full" aria-hidden>
          <rect y="8" width="200" height="14" fill="#C0C6D0" />
          <rect y="10" width="200" height="10" fill="#5BA7E8" />
          {above
            ? Array.from({ length: 24 }, (_, i) => (
                <rect key={i} className="anim-blink" style={{ animationDelay: `${(i % 5) * 0.1}s` }} x={20 + i * 7} y={11 + ((i * 5) % 8)} width="4" height="2" fill="#E0604A" />
              ))
            : <rect x="20" y="14" width="180" height="2" fill="#E0604A" />}
          <rect x="16" y="12" width="4" height="6" fill="#3A2A4A" />
        </svg>
      ) : (
        <div className="px-frame h-6 bg-px-night [--px-b:var(--px-wall-line)]" aria-hidden>
          <div
            className="h-full"
            style={{
              width: `${pct}%`,
              background: d.visual === "heat" ? `hsl(${220 - pct * 2.2} 70% 55%)` : above ? "var(--px-red)" : "var(--px-mint)",
            }}
          />
        </div>
      )}

      <p role="status" className={`text-xl ${above ? "text-px-red" : "text-px-mint"}`}>
        {above ? (d.above as string) : (d.below as string)}
      </p>
      <PixelButton onClick={onFinish} disabled={!moved}>
        I&apos;ve seen enough
      </PixelButton>
    </div>
  );
}

function SortTemplate({ d, onFinish }: { d: Record<string, unknown>; onFinish: () => void }) {
  const groups = d.groups as string[];
  const items = useMemo(() => shuffled(d.items as { label: string; group: string }[]), [d.items]);
  const [choice, setChoice] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);
  const allRight = items.every((it, i) => choice[i] === it.group);

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={it.label} className="flex flex-wrap items-center gap-3">
            <span className="min-w-[9rem] text-xl">{it.label}</span>
            <select
              aria-label={`Group for ${it.label}`}
              value={choice[i] ?? ""}
              onChange={(e) => {
                setChoice((c) => ({ ...c, [i]: e.target.value }));
                setChecked(false);
              }}
              className="px-input px-frame w-auto flex-1 py-1 text-lg"
            >
              <option value="">Choose a group…</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            {checked && <span aria-hidden className={choice[i] === it.group ? "text-px-mint" : "text-px-red"}>{choice[i] === it.group ? "✓" : "✗"}</span>}
          </li>
        ))}
      </ul>
      <CheckRow checked={checked} allRight={allRight} onCheck={() => setChecked(true)} onFinish={onFinish} />
    </div>
  );
}

function OrderTemplate({ d, onFinish }: { d: Record<string, unknown>; onFinish: () => void }) {
  const correct = d.steps as string[];
  const [order, setOrder] = useState(() => {
    const s = shuffled(correct);
    return s.every((x, i) => x === correct[i]) ? [...s.slice(1), s[0]] : s;
  });
  const [checked, setChecked] = useState(false);
  const allRight = order.every((s, i) => s === correct[i]);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    setChecked(false);
  };

  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {order.map((step, i) => (
          <li key={step} className="flex items-center gap-3">
            <span className="font-pixel text-[0.6rem] text-px-gold">{i + 1}</span>
            <span className={`flex-1 text-xl ${checked ? (step === correct[i] ? "text-px-mint" : "text-px-red") : ""}`}>{step}</span>
            <button type="button" aria-label={`Move "${step}" up`} onClick={() => move(i, -1)} className="px-2 font-pixel text-[0.6rem] hover:text-px-gold">
              ▲
            </button>
            <button type="button" aria-label={`Move "${step}" down`} onClick={() => move(i, 1)} className="px-2 font-pixel text-[0.6rem] hover:text-px-gold">
              ▼
            </button>
          </li>
        ))}
      </ol>
      <CheckRow checked={checked} allRight={allRight} onCheck={() => setChecked(true)} onFinish={onFinish} />
    </div>
  );
}

function MatchTemplate({ d, onFinish }: { d: Record<string, unknown>; onFinish: () => void }) {
  const pairs = d.pairs as { left: string; right: string }[];
  const rights = useMemo(() => shuffled(pairs.map((p) => p.right)), [pairs]);
  const [choice, setChoice] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);
  const allRight = pairs.every((p, i) => choice[i] === p.right);

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {pairs.map((p, i) => (
          <li key={p.left} className="flex flex-wrap items-center gap-3">
            <span className="min-w-[9rem] text-xl">{p.left}</span>
            <span aria-hidden className="text-px-muted">→</span>
            <select
              aria-label={`Match for ${p.left}`}
              value={choice[i] ?? ""}
              onChange={(e) => {
                setChoice((c) => ({ ...c, [i]: e.target.value }));
                setChecked(false);
              }}
              className="px-input px-frame w-auto flex-1 py-1 text-lg"
            >
              <option value="">Choose…</option>
              {rights.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {checked && <span aria-hidden className={choice[i] === p.right ? "text-px-mint" : "text-px-red"}>{choice[i] === p.right ? "✓" : "✗"}</span>}
          </li>
        ))}
      </ul>
      <CheckRow checked={checked} allRight={allRight} onCheck={() => setChecked(true)} onFinish={onFinish} />
    </div>
  );
}

function NumericTemplate({ d, onFinish }: { d: Record<string, unknown>; onFinish: () => void }) {
  const [value, setValue] = useState("");
  const [tries, setTries] = useState(0);
  const [result, setResult] = useState<"right" | "wrong" | null>(null);
  const answer = d.answer as number;
  const tolerance = d.tolerance as number;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const ok = Math.abs(Number(value) - answer) <= tolerance;
        setResult(ok ? "right" : "wrong");
        setTries((t) => t + 1);
      }}
      className="space-y-3"
    >
      <label className="block">
        <span className="text-xl">{d.question as string}</span>
        <span className="mt-2 flex items-center gap-3">
          <input
            type="number"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="px-input px-frame w-40"
            aria-label="Your answer"
          />
          <span className="text-xl text-px-muted">{d.unit as string}</span>
        </span>
      </label>
      {result === "wrong" && (
        <p role="status" className="text-lg text-px-red">
          Not quite.{d.hint ? ` Hint: ${d.hint as string}` : ""}
        </p>
      )}
      {result === "right" && (
        <p role="status" className="text-lg text-px-mint">
          That works.
        </p>
      )}
      <div className="flex flex-wrap gap-4">
        <PixelButton type="submit" disabled={!value}>
          Check
        </PixelButton>
        {(result === "right" || tries >= 2) && <PixelButton variant="ghost" onClick={onFinish}>See what happened</PixelButton>}
      </div>
    </form>
  );
}

function CheckRow({
  checked,
  allRight,
  onCheck,
  onFinish,
}: {
  checked: boolean;
  allRight: boolean;
  onCheck: () => void;
  onFinish: () => void;
}) {
  const [checks, setChecks] = useState(0);
  return (
    <div className="space-y-2">
      {checked && (
        <p role="status" className={`text-lg ${allRight ? "text-px-mint" : "text-px-gold"}`}>
          {allRight ? "All correct!" : "Some are off. Adjust and check again."}
        </p>
      )}
      <div className="flex flex-wrap gap-4">
        <PixelButton
          onClick={() => {
            onCheck();
            setChecks((c) => c + 1);
          }}
        >
          Check
        </PixelButton>
        {checked && (allRight || checks >= 2) && (
          <PixelButton variant="ghost" onClick={onFinish}>
            See what happened
          </PixelButton>
        )}
      </div>
    </div>
  );
}
