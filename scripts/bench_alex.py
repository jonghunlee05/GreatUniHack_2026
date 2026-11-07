"""Benchmark Agent 3 across Claude models: latency, template-reply rate, strategy trace.

Spends real API credit (~6 turns per model). Usage:
    .venv/bin/python scripts/bench_alex.py claude-opus-5-5 claude-sonnet-5-5 claude-haiku-5-5
"""

from __future__ import annotations

import json
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from purple.alex_agent import ClaudeEvaluator, process_teaching_turn  # noqa: E402
from purple.contracts import Chapter  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = {
    "economics_chapter.json": [
        "A price ceiling is a maximum price the government sets.",
        "A lower legal price always makes the product available to more people.",
        "Actually no: if the ceiling is below equilibrium it's binding, so quantity demanded goes up and "
        "quantity supplied goes down, which creates a shortage. Like rent control causing waiting lists.",
        "For concert tickets capped at half price, loads more fans want tickets but the organiser sells the "
        "same number or fewer, so they sell out instantly and resellers appear.",
        "If the cap were set above the equilibrium price it wouldn't bind, so nothing changes.",
        "Producers respond to incentives: if a subsidy raises what they earn, they supply more.",
    ],
}


def run(model: str) -> dict:
    evaluator = ClaudeEvaluator(model=model)
    latencies, trace, sources = [], [], []
    for filename, turns in SCRIPTS.items():
        chapter = Chapter.model_validate(json.loads((ROOT / "examples" / filename).read_text()))
        brain, history = None, []
        for message in turns:
            start = time.perf_counter()
            result = process_teaching_turn("bench", chapter, brain, message, history, evaluator=evaluator)
            latencies.append(time.perf_counter() - start)
            brain = result["updated_brain"]
            history += [{"role": "user", "content": message}, {"role": "assistant", "content": result["alex_reply"]}]
            trace.append(f"{result['explanation_quality']}->{result['strategy']}")
            sources.append(result["reply_source"] if result["mode"] == "claude" else "fallback")
    return {
        "model": model,
        "median_s": round(statistics.median(latencies), 2),
        "max_s": round(max(latencies), 2),
        "template_rate": round(sources.count("template") / len(sources), 2),
        "fallbacks": sources.count("fallback"),
        "trace": trace,
    }


if __name__ == "__main__":
    for model in sys.argv[1:] or ["claude-opus-5-5"]:
        print(json.dumps(run(model)))
