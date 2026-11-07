"""Agent 3 — Alex, the adaptive AI apprentice.

Public entry point: `process_teaching_turn(...)`. One structured model call per
teaching turn (Claude), followed by deterministic Python that validates the output,
updates AlexBrain from verbatim evidence, and selects the response strategy.

Without an API key the agent runs a clearly labelled offline demonstration using a
conservative keyword evaluator, so the Teaching Room is always playable.
"""

from __future__ import annotations

import base64
import hashlib
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from .alex_brain import (
    AlexState,
    TurnRecord,
    apply_evaluations,
    compute_readiness,
    concept_by_id,
    is_sufficient,
    next_focus_concept,
    objective_of,
    update_running_summary,
    MAX_HISTORY,
    MAX_PROCESSED,
)
from .alex_engine import APPLICATION_MARKERS, _phrase_hit, _semantic_overlap, _terms
from .alex_media import env_value
from .alex_prompts import ACTION_PROMPTS, SYSTEM_PROMPT, chapter_block, turn_prompt
from .alex_schemas import (
    QUALITIES,
    WEAK_QUALITIES,
    AlexLine,
    AlexModelOutput,
    AssessmentFeedback,
    ConceptEvaluation,
    TeachingInput,
    TeachingTurnResult,
)
from .contracts import Chapter, Concept

DEFAULT_MODEL = "claude-opus-5-5"
DEFAULT_EFFORT = "low"  # conversational turns: low effort keeps latency down
SCAFFOLD_AFTER = 3  # consecutive weak turns on one concept before simplifying
RECENT_WINDOW = 6  # conversation messages sent verbatim each turn
REPEAT_LOOKBACK = 6
ROOT = Path(__file__).resolve().parents[1]

OFFLINE_NOTICE = (
    "Offline demonstration: no Claude API key found, so Alex is using a simple "
    "keyword evaluator. Set ANTHROPIC_API_KEY for real understanding."
)


class AlexConfigError(RuntimeError):
    """Raised when live mode is required but no Claude credentials are available."""


class EvaluatorError(RuntimeError):
    """The evaluator could not produce a valid structured result."""


# ------------------------------------------------------------------ credentials


def resolve_api_key() -> str | None:
    """ANTHROPIC_API_KEY from the environment, else from apps/web/.env.local."""
    if os.getenv("ALEX_OFFLINE") == "1":
        return None
    return env_value("ANTHROPIC_API_KEY")


# ------------------------------------------------------------------ evaluation


@dataclass
class EvalContext:
    chapter: Chapter
    state: AlexState
    input: TeachingInput
    game_state: dict
    recent_conversation: list[dict] = field(default_factory=list)


class Evaluator(Protocol):
    mode: str

    def evaluate(self, ctx: EvalContext) -> AlexModelOutput: ...


class ClaudeEvaluator:
    """Single structured Claude call per turn; chapter context is prompt-cached."""

    mode = "claude"

    def __init__(self, client: Any = None, model: str | None = None, effort: str | None = None,
                 use_fallbacks: bool = True):
        if client is None:
            import anthropic

            client = anthropic.Anthropic(api_key=resolve_api_key(), timeout=45.0, max_retries=1)
        self.client = client
        self.model = model or os.getenv("ALEX_MODEL", DEFAULT_MODEL)
        self.effort = effort or os.getenv("ALEX_EFFORT", DEFAULT_EFFORT)
        self.use_fallbacks = use_fallbacks

    def evaluate(self, ctx: EvalContext) -> AlexModelOutput:
        content: list[dict] = []
        if ctx.input.has_image:
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": ctx.input.image_media_type or "image/png",
                    "data": base64.standard_b64encode(ctx.input.image_bytes or b"").decode(),
                },
            })
        content.append({
            "type": "text",
            "text": turn_prompt(
                message=ctx.input.text,
                modality=ctx.input.modality,
                has_image=ctx.input.has_image,
                game_state=ctx.game_state,
                recent_conversation=ctx.recent_conversation,
                running_summary=ctx.state.running_summary,
            ),
        })
        return self._parse(ctx.chapter, content, AlexModelOutput)

    def say(self, chapter: Chapter, instruction: str) -> str:
        """One short in-character line for a toolbar action (same cached prefix)."""
        line = self._parse(chapter, [{"type": "text", "text": instruction}], AlexLine)
        return line.alex_reply.strip()

    def _parse(self, chapter: Chapter, content: list[dict], schema: type) -> Any:
        kwargs: dict[str, Any] = dict(
            model=self.model,
            max_tokens=4096,
            system=[
                {"type": "text", "text": SYSTEM_PROMPT},
                {"type": "text", "text": chapter_block(chapter),
                 "cache_control": {"type": "ephemeral"}},
            ],
            messages=[{"role": "user", "content": content}],
            output_format=schema,
            output_config={"effort": self.effort},
        )
        if self.use_fallbacks:
            kwargs.update(betas=["server-side-fallback-2026-07-01"], fallbacks="default")
        response = self.client.beta.messages.parse(**kwargs)
        if response.stop_reason == "refusal":
            raise EvaluatorError("Claude declined this turn")
        if response.stop_reason == "max_tokens":
            raise EvaluatorError("Claude's answer was cut off")
        parsed = response.parsed_output
        if parsed is None:
            raise EvaluatorError("Claude returned no structured output")
        return schema.model_validate(parsed.model_dump())


CONFIRM_WORDS = {"yes", "yep", "yeah", "correct", "right", "exactly", "spot", "perfect"}
AWAITING_STAGES = ("example_requested", "apply_asked", "transfer_asked")
EXAMPLE_PHRASES = ("for example", "for instance", "e.g", "imagine", "suppose", "such as", "like when")


class OfflineEvaluator:
    """Deterministic keyword evaluator. Conservative; for demos and tests only."""

    mode = "offline-demo"

    def evaluate(self, ctx: EvalContext) -> AlexModelOutput:
        chapter, state, text = ctx.chapter, ctx.state, ctx.input.text.strip()
        current = concept_by_id(chapter, state.current_concept_id) or chapter.concepts[0]
        image_note = (
            "Image received; the offline demo cannot interpret images." if ctx.input.has_image else ""
        )
        lower = text.lower()
        words = re.findall(r"[a-z']+", lower)
        last = state.history[-1] if state.history else None

        if not text:
            return _offline_output(current.id, "vague", [], image_note=image_note)
        # A bare "yes / no / not quite" answers Alex's summary; anything longer (e.g. a
        # correction with content) is evaluated as teaching so misconceptions are caught.
        bare_reply = len(words) <= 4 and lower.startswith(("no", "not quite", "nope"))
        if (last and last.strategy == "SUMMARISE" and len(words) <= 15
                and ((CONFIRM_WORDS & set(words) and not lower.startswith(("no", "not"))) or bare_reply)):
            return _offline_output(current.id, "confirmation", [], image_note=image_note)

        def relevance(concept: Concept) -> float:
            score = _semantic_overlap(_concept_text(concept), text)
            if concept.label.lower() in lower:
                score += 0.25
            if any(_phrase_hit(m, lower) for m in concept.common_misconceptions):
                score += 1.0
            if concept.id == current.id:
                # Alex just asked about this concept, so an answer most likely concerns it.
                awaiting = state.concept_stage.get(current.id) in AWAITING_STAGES
                score += 0.3 if awaiting else 0.02
            return score

        target = max(chapter.concepts, key=relevance)
        overlap = _semantic_overlap(_concept_text(target), text)
        stage = state.concept_stage.get(target.id, "learning")
        misconceptions = [m for m in target.common_misconceptions if _phrase_hit(m, lower)]
        hits = [p for p in target.key_points if _semantic_overlap(p, text) >= 0.28]
        missing = [p for p in target.key_points if p not in hits]
        applies = bool(APPLICATION_MARKERS & set(words)) or any(p in lower for p in EXAMPLE_PHRASES)

        if misconceptions:
            quality, level = "incorrect", 1
        elif stage in AWAITING_STAGES and applies and (overlap >= 0.08 or len(words) >= 10):
            quality, level = "applied", 3
        elif target.key_points and not missing:
            quality, level = ("applied", 3) if applies else ("definition_only", 2)
        elif hits or overlap >= 0.2:
            quality, level = "partial", 1
        elif overlap >= 0.08:
            quality, level = "vague", 0
        else:
            quality, level, target = "off_topic", 0, current
            missing = list(current.key_points)

        knowledge = state.brain.concepts[target.id]
        evaluation = ConceptEvaluation(
            concept_id=target.id,
            mastery_level=level,
            supporting_evidence=[text] if quality in {"partial", "definition_only", "applied"} else [],
            missing_explanations=missing,
            misconceptions=misconceptions,
            resolved_misconceptions=(
                list(knowledge.misconceptions) if quality in {"definition_only", "applied"} else []
            ),
            confidence=min(0.95, 0.4 + overlap),
        )
        return _offline_output(target.id, quality, [evaluation], image_note=image_note)


def _offline_output(concept_id: str, quality: str, evaluations: list[ConceptEvaluation],
                    image_note: str = "") -> AlexModelOutput:
    return AlexModelOutput(
        explanation_quality=quality,  # type: ignore[arg-type]
        target_concept_id=concept_id,
        response_strategy="CLARIFY",  # replaced by the policy
        updated_concept_evaluations=evaluations,
        alex_reply="",
        next_question="",
        image_observations=image_note,
        teaching_progress_summary="",
    )


def _concept_text(concept: Concept) -> str:
    return " ".join([concept.label, concept.reference_explanation, *concept.key_points])


# ---------------------------------------------------------------- strategy policy


@dataclass
class Decision:
    strategy: str
    target_concept_id: str
    stage: str | None = None  # new stage for target
    focus_concept_id: str | None = None  # concept Alex will discuss next
    summarise: list[str] = field(default_factory=list)
    acknowledge_feedback: bool = False


def decide(quality: str, state: AlexState, chapter: Chapter, target_id: str) -> Decision:
    """Pure, deterministic strategy selection from knowledge state + this turn's quality."""
    stage = state.concept_stage.get(target_id, "learning")
    weak = quality in WEAK_QUALITIES
    struggle = state.struggle_counts.get(target_id, 0) + (1 if weak else 0)
    last = state.history[-1] if state.history else None

    if state.pending_feedback and not state.feedback_acknowledged and state.feedback_targets:
        failed = state.feedback_targets[0]
        if weak or target_id != failed:
            return Decision("CLARIFY", failed, focus_concept_id=failed, acknowledge_feedback=True)

    if quality == "confirmation":
        if last and last.strategy == "SUMMARISE":
            if is_sufficient(state, target_id):
                return _progress(state, chapter, target_id)
            # Confirmed but not yet shown in use: test application before moving on.
            if state.brain.concepts[target_id].level >= 2:
                return Decision("APPLY", target_id, stage="apply_asked", focus_concept_id=target_id)
            return Decision("CLARIFY", target_id, focus_concept_id=target_id)
        weak, struggle = True, struggle + 1

    if weak:
        if struggle >= SCAFFOLD_AFTER:
            return Decision("SCAFFOLD", target_id, focus_concept_id=target_id)
        if quality == "incorrect":
            return Decision("CHALLENGE", target_id, stage="learning", focus_concept_id=target_id)
        return Decision("CLARIFY", target_id, focus_concept_id=target_id)

    if quality == "definition_only":
        return Decision("EXAMPLE", target_id, stage="example_requested", focus_concept_id=target_id)

    # quality == "applied"
    if stage in ("learning", "example_requested"):
        return Decision("APPLY", target_id, stage="apply_asked", focus_concept_id=target_id)
    if stage == "apply_asked":
        return Decision("TRANSFER", target_id, stage="transfer_asked", focus_concept_id=target_id)
    return _concept_done(state, chapter, target_id)


def _concept_done(state: AlexState, chapter: Chapter, target_id: str) -> Decision:
    done = [c.id for c in chapter.concepts
            if c.id == target_id or state.concept_stage.get(c.id) == "done"]
    unsummarised = [cid for cid in done if cid not in state.summarised_concepts]
    if len(unsummarised) >= 2:
        return Decision("SUMMARISE", target_id, stage="done", focus_concept_id=target_id,
                        summarise=unsummarised)
    decision = _progress(state, chapter, target_id)
    decision.stage = "done"
    return decision


def _progress(state: AlexState, chapter: Chapter, target_id: str) -> Decision:
    nxt = next_focus_concept(state, chapter, exclude=target_id)
    return Decision("PROGRESS", target_id, focus_concept_id=nxt.id if nxt else target_id)


def strategy_table(state: AlexState, chapter: Chapter, target_id: str) -> dict[str, str]:
    return {q: decide(q, state, chapter, target_id).strategy for q in QUALITIES}


# ------------------------------------------------------------------ replies

TEMPLATES: dict[str, list[str]] = {
    "CLARIFY": [
        "Hmm, I think I'm missing a piece. How does that connect to {missing}?",
        "I'm not sure I follow yet. Could you explain {missing} a bit more?",
        "Wait, can you say that another way? I don't see how it links to {label} yet.",
        "I get part of it! What happens with {missing}, though?",
    ],
    "CHALLENGE": [
        "Oh, so {misconception}? Is there a case where that wouldn't be true?",
        "Hmm, I want to be careful. If {misconception}, how would you explain a situation that seems to contradict it?",
        "I'm a bit confused. What evidence tells us that {misconception}?",
    ],
    "EXAMPLE": [
        "I think I get what {label} means! Could you give me a real example?",
        "That definition makes sense. What would {label} look like in real life?",
        "Can you show me {label} happening in a concrete situation?",
    ],
    "APPLY": [
        "That makes sense! If I met a brand-new situation in {subject}, how would I use {label} to work out what happens?",
        "Ooh, let me try using it. Can you give me a new scenario where {label} decides the outcome, and walk me through it?",
        "Okay! How would {label} help me predict what happens in a different real case?",
    ],
    "TRANSFER": [
        "Cool! What if we changed one key condition in that scenario? Would {label} still work the same way?",
        "What if the situation were much more extreme, or the main assumption flipped? What would change about {label}?",
        "Does {label} still hold if a different constraint applied? What would be different?",
    ],
    "SUMMARISE": [
        "Let me check I've got it: {summary}. Did I get that right?",
        "So far I think I've learned: {summary}. Is that right, or did I mix something up?",
    ],
    "SCAFFOLD": [
        "I think I'm overcomplicating this. Could you explain {label} as if I were completely new, maybe with an analogy?",
        "Let's step back. What's the simplest thing I need to understand before {label}?",
        "Could you draw or describe a tiny picture of {label} for me? I learn better that way.",
    ],
    "PROGRESS": [
        "Thanks, I feel good about {label} now! What should I learn about {next_label} next?",
        "I think {label} makes sense to me now. Can you teach me about {next_label}?",
        "Great, that clicks! Shall we move on to {next_label}?",
    ],
}
READY_TEMPLATES = [
    "I think I've learned everything in this chapter well enough to try the assessment! Is there anything you want to check first?",
    "I feel ready to attempt the assessment for this chapter. Anything else I should know before I try?",
]
FEEDBACK_TEMPLATES = [
    "I got stuck in the assessment: {mistake} Could you explain what I misunderstood about {label}?",
    "The assessment showed a gap: {mistake} Can you help me understand {label} properly?",
]


def _question_of(reply: str) -> str:
    parts = re.findall(r"[^.!?]*\?", reply)
    return parts[-1].strip() if parts else reply.strip()


def is_repeat(question: str, asked: list[str]) -> bool:
    q = _terms(question)
    if not q:
        return False
    for previous in asked[-REPEAT_LOOKBACK:]:
        p = _terms(previous)
        if p and len(q & p) / len(q | p) >= 0.75:
            return True
    return False


def _template_reply(strategy: str, data: dict, state: AlexState, ready: bool, ack: bool) -> str:
    if ack:
        options = FEEDBACK_TEMPLATES
    elif strategy == "PROGRESS" and ready:
        options = READY_TEMPLATES
    else:
        options = TEMPLATES[strategy]
    rendered = [o.format(**data).replace("….", "…") for o in options]
    for reply in rendered:
        if not is_repeat(_question_of(reply), state.asked_questions):
            return reply
    # All variants used recently: rotate deterministically by turn rather than repeat the last one.
    return rendered[state.turn % len(rendered)]


def _template_data(state: AlexState, chapter: Chapter, decision: Decision) -> dict:
    target = concept_by_id(chapter, decision.target_concept_id) or chapter.concepts[0]
    focus = concept_by_id(chapter, decision.focus_concept_id) or target
    knowledge = state.brain.concepts[target.id]
    missing = (knowledge.missing_points or target.key_points or [target.label])[0]
    misconception = (knowledge.misconceptions or target.common_misconceptions or [target.label])[-1]
    summary_ids = decision.summarise or [target.id]
    summary_parts = []
    for cid in summary_ids:
        concept = concept_by_id(chapter, cid)
        evidence = state.brain.concepts[cid].supporting_evidence
        if concept and evidence:
            summary_parts.append(f"{concept.label}: {_shorten(evidence[-1])}")
    feedback = state.pending_feedback
    return {
        "label": target.label,
        "missing": _lower_first(missing.rstrip(".")),
        "misconception": _lower_first(misconception.rstrip(".")),
        "subject": chapter.subject,
        "next_label": focus.label,
        "summary": "; ".join(summary_parts) or "what you taught me",
        "mistake": (feedback.alex_mistake.strip() if feedback and feedback.alex_mistake
                    else f"I didn't understand {target.label} well enough."),
    }


def _shorten(text: str, limit: int = 90) -> str:
    text = " ".join(text.split()).rstrip(".!? ")
    return text if len(text) <= limit else text[: limit - 1].rsplit(" ", 1)[0] + "…"


def _lower_first(text: str) -> str:
    return text[:1].lower() + text[1:] if text else text


# --------------------------------------------------------- feedback & chapters


def load_chapter_pack(chapter_pack: Any, game_id: str = "standalone") -> Chapter:
    """Accept a purple Chapter, its dict, or a web-generator chapter dict (ilos/keyConcepts)."""
    if isinstance(chapter_pack, Chapter):
        return chapter_pack
    if isinstance(chapter_pack, dict):
        if "learning_objectives" in chapter_pack and "concepts" in chapter_pack:
            return Chapter.model_validate(chapter_pack)
        if "ilos" in chapter_pack:
            return Chapter.from_generated_chapter(chapter_pack, game_id=game_id)
    raise TypeError("chapter_pack must be a Chapter or a chapter dict")


def register_feedback(state: AlexState, chapter: Chapter, feedback: AssessmentFeedback | dict) -> None:
    """Remember an assessment failure so the next turns re-teach it. Mastery is untouched."""
    fb = AssessmentFeedback.model_validate(feedback) if isinstance(feedback, dict) else feedback
    if fb.chapter_id != chapter.chapter_id:
        return
    if state.feedback_history and state.feedback_history[-1] == fb:
        return  # same feedback re-sent by a rerun
    targets: list[str] = []
    for failed in fb.failed_concepts:
        concept = _match_concept(chapter, failed, fb.recommended_revision)
        if concept and concept.id not in targets:
            targets.append(concept.id)
    if not targets:
        targets = [state.current_concept_id or chapter.concepts[0].id]
    state.pending_feedback = fb
    state.feedback_targets = targets
    state.feedback_acknowledged = False
    state.feedback_history.append(fb)
    for cid in targets:
        knowledge = state.brain.concepts[cid]
        if fb.recommended_revision and fb.recommended_revision not in knowledge.missing_points:
            knowledge.missing_points = [fb.recommended_revision, *knowledge.missing_points][:5]
        state.concept_stage[cid] = "learning"
    state.current_concept_id = targets[0]


def _match_concept(chapter: Chapter, failed: str, hint: str) -> Concept | None:
    exact = concept_by_id(chapter, failed)
    if exact:
        return exact
    query = failed.replace("_", " ") + " " + hint
    scored = [(_semantic_overlap(query, _concept_text(c) + " " + c.id.replace("_", " ")), c)
              for c in chapter.concepts]
    score, best = max(scored, key=lambda item: item[0])
    return best if score > 0 else None


def feedback_from_attempt(chapter: Chapter, task: Any, attempt: Any, brain: Any) -> AssessmentFeedback | None:
    """Build feedback from the purple assessment room's completed Attempt."""
    failed_decisions = [d for d in attempt.decisions if not d.success]
    weak = [cid for cid in task.required_concepts
            if cid in brain.concepts and (brain.concepts[cid].level < 2 or brain.concepts[cid].misconceptions)]
    if not failed_decisions and not weak:
        return None
    failed = weak or list(task.required_concepts)
    labels = [c.label for c in chapter.concepts if c.id in failed]
    mistake = failed_decisions[0].explanation if failed_decisions else ""
    return AssessmentFeedback(
        chapter_id=chapter.chapter_id,
        failed_concepts=failed,
        alex_mistake=mistake,
        recommended_revision="Re-explain " + ", ".join(labels),
    )


def opening_message(chapter: Chapter, state: AlexState) -> str:
    """Alex's first line when the Teaching Room opens (no API call)."""
    if state.pending_feedback and not state.feedback_acknowledged:
        concept = concept_by_id(chapter, state.feedback_targets[0] if state.feedback_targets else None)
        label = concept.label if concept else chapter.title
        mistake = state.pending_feedback.alex_mistake or f"I didn't really understand {label}."
        return f"I'm back from the assessment and I got stuck. {mistake} Could you help me with {label}?"
    if state.turn == 0:
        first = concept_by_id(chapter, state.current_concept_id) or chapter.concepts[0]
        return f"Hi! I know very little about {chapter.title}. Could you start by teaching me about {first.label}?"
    return "Welcome back! What should we work on next?"


# --------------------------------------------------------------- orchestration

_default_evaluator: Evaluator | None = None


def default_evaluator(require_live: bool = False) -> tuple[Evaluator, list[str]]:
    global _default_evaluator
    key = resolve_api_key()
    if key:
        if not isinstance(_default_evaluator, ClaudeEvaluator):
            _default_evaluator = ClaudeEvaluator()
        return _default_evaluator, []
    if require_live:
        raise AlexConfigError(
            "No Claude API key found. Set ANTHROPIC_API_KEY in your environment or in "
            "apps/web/.env.local, then restart."
        )
    return OfflineEvaluator(), [OFFLINE_NOTICE]


def make_turn_id(chapter_id: str, turn: int, teaching: TeachingInput) -> str:
    digest = hashlib.sha256()
    for part in (chapter_id, str(turn), teaching.modality, teaching.text.strip()):
        digest.update(part.encode() + b"\x00")
    if teaching.image_bytes:
        digest.update(hashlib.sha256(teaching.image_bytes).digest())
    return digest.hexdigest()[:16]


def build_game_state(state: AlexState, chapter: Chapter) -> dict:
    target = state.current_concept_id or chapter.concepts[0].id
    nxt = next_focus_concept(state, chapter, exclude=target)
    game: dict[str, Any] = {
        "current_concept_id": target,
        "current_objective_id": state.current_objective_id,
        "concepts": [
            {
                "id": c.id,
                "mastery": state.brain.concepts[c.id].level,
                "stage": state.concept_stage.get(c.id, "learning"),
                "struggle": state.struggle_counts.get(c.id, 0),
            }
            for c in chapter.concepts
        ],
        "open_misconceptions": {
            c.id: state.brain.concepts[c.id].misconceptions
            for c in chapter.concepts if state.brain.concepts[c.id].misconceptions
        },
        "recent_questions": state.asked_questions[-REPEAT_LOOKBACK:],
        # Required strategy per (target concept, quality): Claude picks the row for its target.
        "strategy_table": {
            c.id: strategy_table(state, chapter, c.id)
            for c in chapter.concepts[:8]
        },
        "next_focus": {"id": nxt.id, "label": nxt.label} if nxt else None,
        "readiness_if_progress": "ready_for_assessment"
        if all(is_sufficient(state, c.id) or c.id == target for c in chapter.concepts)
        else "learning",
    }
    if state.pending_feedback and not state.feedback_acknowledged:
        game["assessment_feedback"] = {
            "alex_mistake": state.pending_feedback.alex_mistake,
            "failed_concepts": state.feedback_targets,
            "recommended_revision": state.pending_feedback.recommended_revision,
        }
    return game


def process_teaching_turn(
    game_id: str,
    chapter_pack: Any,
    alex_brain: Any,
    message: str | TeachingInput,
    conversation_history: list[dict] | None = None,
    assessment_feedback: AssessmentFeedback | dict | None = None,
    *,
    turn_id: str | None = None,
    evaluator: Evaluator | None = None,
    require_live: bool = False,
) -> dict:
    """Run one teaching turn and return the reply plus the updated AlexBrain state.

    `alex_brain` may be an AlexState (or its dict), a legacy AlexBrain, or None. The
    caller stores `result["updated_brain"]` and passes it back next turn. Passing the
    same `turn_id` twice (e.g. a Streamlit rerun) returns the cached result without
    another model call.
    """
    chapter = load_chapter_pack(chapter_pack, game_id)
    state = AlexState.coerce(alex_brain, chapter)
    teaching = message if isinstance(message, TeachingInput) else TeachingInput(text=str(message))
    tid = turn_id or make_turn_id(chapter.chapter_id, state.turn, teaching)

    if tid in state.processed_turns:
        cached = TeachingTurnResult.model_validate(state.processed_turns[tid])
        cached.mode = "cached"
        cached.updated_brain = state.model_dump(mode="json")
        return cached.model_dump(mode="json")

    if assessment_feedback is not None:
        register_feedback(state, chapter, assessment_feedback)

    warnings: list[str] = []
    if evaluator is None:
        evaluator, warnings = default_evaluator(require_live)
    mode = evaluator.mode

    state.turn += 1
    ctx = EvalContext(
        chapter=chapter,
        state=state,
        input=teaching,
        game_state=build_game_state(state, chapter),
        recent_conversation=list(conversation_history or [])[-RECENT_WINDOW:],
    )
    try:
        output = evaluator.evaluate(ctx)
    except Exception as exc:  # provider/network/validation failure: never block the game
        if require_live and isinstance(exc, AlexConfigError):
            raise
        warnings.append(f"Claude was unavailable this turn ({type(exc).__name__}); used offline evaluator.")
        output = OfflineEvaluator().evaluate(ctx)
        mode = "offline-fallback"

    known = {c.id for c in chapter.concepts}
    target_id = output.target_concept_id if output.target_concept_id in known else (
        next((e.concept_id for e in output.updated_concept_evaluations if e.concept_id in known),
             state.current_concept_id or chapter.concepts[0].id)
    )
    quality = output.explanation_quality

    # Evidence-based brain update first, then the policy reads the updated levels.
    applied = apply_evaluations(state, chapter, output.updated_concept_evaluations, teaching.text, quality)
    decision = decide(quality, state, chapter, target_id)
    _commit(state, chapter, decision, quality, applied)
    readiness = compute_readiness(state, chapter)

    data = _template_data(state, chapter, decision)
    ready = decision.strategy == "PROGRESS" and readiness == "ready_for_assessment"
    model_reply = output.alex_reply.strip()
    # Feedback acknowledgements must match exactly; otherwise similar strategies are accepted.
    strategy_ok = (
        output.response_strategy == decision.strategy
        if decision.acknowledge_feedback
        else strategies_compatible(output.response_strategy, decision.strategy)
    )
    use_model = bool(
        mode == "claude"
        and model_reply
        and strategy_ok
        and not is_repeat(_question_of(model_reply), state.asked_questions)
    )
    source = "model" if use_model else "template"
    if mode == "claude":
        state.reply_stats[source] = state.reply_stats.get(source, 0) + 1
    reply = model_reply if use_model else _template_reply(
        decision.strategy, data, state, ready, decision.acknowledge_feedback
    )
    question = _question_of(reply)

    state.asked_questions = (state.asked_questions + [question])[-20:]
    state.history = (state.history + [TurnRecord(
        turn=state.turn, turn_id=tid, modality=teaching.modality,
        student_text=teaching.text[:500], quality=quality, strategy=decision.strategy,
        target_concept_id=target_id, question=question,
    )])[-MAX_HISTORY:]
    update_running_summary(state, RECENT_WINDOW)
    state.readiness = readiness

    summary = output.teaching_progress_summary.strip() if use_model else ""
    result = TeachingTurnResult(
        turn_id=tid,
        mode=mode,  # type: ignore[arg-type]
        alex_reply=reply,
        strategy=decision.strategy,  # type: ignore[arg-type]
        response_strategy=decision.strategy,  # type: ignore[arg-type]
        target_concept_id=target_id,
        explanation_quality=quality,
        updated_concept_evaluations=applied,
        supporting_evidence=[q for e in applied for q in e.supporting_evidence],
        misconceptions=[m for e in applied for m in e.misconceptions],
        next_question=question,
        readiness=readiness,
        readiness_status=readiness,
        teaching_progress_summary=summary or _progress_summary(state, chapter),
        image_observations=output.image_observations,
        reply_source=source,  # type: ignore[arg-type]
        reaction=reaction_for(decision.strategy, quality, readiness),  # type: ignore[arg-type]
        template_rate=template_rate(state),
        warnings=warnings,
    )
    state.processed_turns[tid] = result.model_dump(mode="json", exclude={"updated_brain"})
    if len(state.processed_turns) > MAX_PROCESSED:
        for old in list(state.processed_turns)[:-MAX_PROCESSED]:
            del state.processed_turns[old]
    result.updated_brain = state.model_dump(mode="json")
    return result.model_dump(mode="json")


def _commit(state: AlexState, chapter: Chapter, decision: Decision, quality: str,
            applied: list[ConceptEvaluation]) -> None:
    target = decision.target_concept_id
    if quality in WEAK_QUALITIES or (quality == "confirmation" and decision.strategy != "PROGRESS"):
        state.struggle_counts[target] = state.struggle_counts.get(target, 0) + 1
    elif decision.strategy != "SCAFFOLD":
        state.struggle_counts[target] = 0
    if decision.stage:
        state.concept_stage[target] = decision.stage
    if decision.summarise:
        state.summarised_concepts = list(dict.fromkeys(state.summarised_concepts + decision.summarise))
    if decision.acknowledge_feedback:
        state.feedback_acknowledged = True
    elif state.pending_feedback:
        state.feedback_acknowledged = True
    # Assessment failures are cleared only by new supporting evidence for that concept.
    for evaluation in applied:
        if evaluation.concept_id in state.feedback_targets and evaluation.supporting_evidence \
                and quality not in WEAK_QUALITIES:
            state.feedback_targets.remove(evaluation.concept_id)
    if state.pending_feedback and not state.feedback_targets:
        state.pending_feedback = None
    focus = concept_by_id(chapter, decision.focus_concept_id) or concept_by_id(chapter, target)
    if focus:
        state.current_concept_id = focus.id
        state.current_objective_id = objective_of(chapter, focus)


def _progress_summary(state: AlexState, chapter: Chapter) -> str:
    learned = [c.label for c in chapter.concepts if state.brain.concepts[c.id].level >= 2]
    shaky = [c.label for c in chapter.concepts if state.brain.concepts[c.id].misconceptions]
    parts = [f"Understood: {', '.join(learned)}." if learned else "Nothing understood yet."]
    if shaky:
        parts.append(f"Possible misconceptions: {', '.join(shaky)}.")
    return " ".join(parts)


# ------------------------------------------------------------ reactions & stats

# Pairs whose replies ask the same kind of question, so a natural model reply is kept.
COMPATIBLE = {("CLARIFY", "SCAFFOLD"), ("SCAFFOLD", "CLARIFY"), ("APPLY", "TRANSFER"), ("TRANSFER", "APPLY")}


def strategies_compatible(model_strategy: str, policy_strategy: str) -> bool:
    return model_strategy == policy_strategy or (model_strategy, policy_strategy) in COMPATIBLE


def reaction_for(strategy: str, quality: str, readiness: str) -> str:
    """Avatar state: curious | confused | thinking | understanding | got_it."""
    if strategy == "PROGRESS":
        return "got_it"
    if strategy == "SUMMARISE":
        return "understanding"
    if strategy in ("CHALLENGE", "SCAFFOLD") or quality in ("vague", "off_topic", "incorrect"):
        return "confused"
    if strategy == "TRANSFER":
        return "thinking"
    if strategy == "APPLY":
        return "understanding"
    return "curious"


def template_rate(state: AlexState) -> float | None:
    total = sum(state.reply_stats.values())
    return round(state.reply_stats.get("template", 0) / total, 3) if total else None


# ---------------------------------------------------------------- toolbar actions

ACTIONS = ("check_memory", "teach_back", "give_example", "challenge")


def memory_snapshot(state: AlexState, chapter: Chapter) -> list[dict]:
    return [
        {
            "concept_id": c.id,
            "label": c.label,
            "mastery_level": state.brain.concepts[c.id].level,
            "supporting_evidence": state.brain.concepts[c.id].supporting_evidence,
            "misconceptions": state.brain.concepts[c.id].misconceptions,
            "missing_explanations": state.brain.concepts[c.id].missing_points,
            "stage": state.concept_stage.get(c.id, "learning"),
        }
        for c in chapter.concepts
    ]


def run_alex_action(
    game_id: str,
    chapter_pack: Any,
    alex_brain: Any,
    action: str,
    *,
    turn_id: str | None = None,
    evaluator: Evaluator | None = None,
) -> dict:
    """Toolbar actions. They never change mastery: only the teacher's next reply
    (through `process_teaching_turn`) can add evidence.

    - check_memory: what Alex remembers (no API call)
    - teach_back: Alex explains from stored evidence, then asks to confirm/correct
    - give_example: Alex tries an example from what he was taught, then asks to confirm
    - challenge: an APPLY/TRANSFER scenario; the answer is judged as an application
    """
    if action not in ACTIONS:
        raise ValueError(f"Unknown action {action!r}; expected one of {ACTIONS}")
    chapter = load_chapter_pack(chapter_pack, game_id)
    state = AlexState.coerce(alex_brain, chapter)
    tid = turn_id or hashlib.sha256(f"{chapter.chapter_id}|{state.turn}|{len(state.history)}|{action}".encode()).hexdigest()[:16]
    if tid in state.processed_turns:
        cached = dict(state.processed_turns[tid], mode="cached")
        cached["updated_brain"] = state.model_dump(mode="json")
        return cached

    warnings: list[str] = []
    if evaluator is None:
        evaluator, warnings = default_evaluator()
    memory = memory_snapshot(state, chapter)
    taught = [m for m in memory if m["supporting_evidence"]]
    current = concept_by_id(chapter, state.current_concept_id) or chapter.concepts[0]
    strategy, target, fallback, instruction, record = "CLARIFY", current, "", "", True

    if action == "check_memory":
        record = False
        lines = [f"{m['label']} {m['mastery_level']}/3" + (" (I might have this wrong)" if m["misconceptions"] else "")
                 for m in memory]
        fallback = "Here's what's in my head right now: " + "; ".join(lines) + ". What should we work on?"
    elif not taught:
        record = False
        fallback = f"I haven't been taught anything I can use yet. Could you start with {current.label}?"
    elif action in ("teach_back", "give_example"):
        strategy = "SUMMARISE"
        best = max(taught, key=lambda m: m["mastery_level"])
        target = concept_by_id(chapter, best["concept_id"]) or current
        evidence = "; ".join(f"{m['label']}: {' / '.join(m['supporting_evidence'][-2:])}" for m in taught)
        if action == "teach_back":
            fallback = _template_reply("SUMMARISE", {**_template_data(state, chapter, Decision("SUMMARISE", target.id,
                summarise=[m["concept_id"] for m in taught])), }, state, False, False)
            instruction = ACTION_PROMPTS["teach_back"].format(evidence=evidence, misconceptions=_open_misc(memory))
        else:
            fallback = (f"Let me try my own example of {target.label}, from what you said: "
                        f"{_shorten(best['supporting_evidence'][-1])}. Is that a good example, or am I off?")
            instruction = ACTION_PROMPTS["give_example"].format(label=target.label, evidence=evidence,
                                                                misconceptions=_open_misc(memory))
    else:  # challenge
        candidates = sorted(taught, key=lambda m: -m["mastery_level"])
        target = concept_by_id(chapter, candidates[0]["concept_id"]) or current
        stage = state.concept_stage.get(target.id, "learning")
        strategy = "TRANSFER" if stage in ("apply_asked", "transfer_asked", "done") else "APPLY"
        state.concept_stage[target.id] = "transfer_asked" if strategy == "TRANSFER" else "apply_asked"
        decision = Decision(strategy, target.id, focus_concept_id=target.id)
        fallback = _template_reply(strategy, _template_data(state, chapter, decision), state, False, False)
        instruction = ACTION_PROMPTS["challenge"].format(
            strategy=strategy, label=target.label,
            evidence=" / ".join(state.brain.concepts[target.id].supporting_evidence[-2:]),
            recent=state.asked_questions[-REPEAT_LOOKBACK:])

    reply, mode, source = fallback, evaluator.mode, "template"
    if instruction and isinstance(evaluator, ClaudeEvaluator):
        try:
            said = evaluator.say(chapter, instruction)
            if said and not is_repeat(_question_of(said), state.asked_questions):
                reply, source = said, "model"
        except Exception as exc:
            warnings.append(f"Claude was unavailable ({type(exc).__name__}); used a simple reply.")
            mode = "offline-fallback"

    state.turn += 1
    question = _question_of(reply)
    if record:
        state.current_concept_id = target.id
        state.current_objective_id = objective_of(chapter, target)
        state.asked_questions = (state.asked_questions + [question])[-20:]
        state.history = (state.history + [TurnRecord(
            turn=state.turn, turn_id=tid, modality="action", student_text=f"[{action}]",
            quality="confirmation" if strategy == "SUMMARISE" else "applied",
            strategy=strategy, target_concept_id=target.id, question=question,
        )])[-MAX_HISTORY:]
    result = {
        "turn_id": tid, "action": action, "mode": mode, "alex_reply": reply, "reply_source": source,
        "strategy": strategy, "target_concept_id": target.id, "next_question": question,
        "reaction": "thinking" if action == "challenge" else "understanding" if taught else "curious",
        "readiness": compute_readiness(state, chapter), "memory": memory, "warnings": warnings,
    }
    state.processed_turns[tid] = dict(result)
    result["updated_brain"] = state.model_dump(mode="json")
    return result


def _open_misc(memory: list[dict]) -> str:
    items = [f"{m['label']}: {x}" for m in memory for x in m["misconceptions"]]
    return "; ".join(items) or "none"
