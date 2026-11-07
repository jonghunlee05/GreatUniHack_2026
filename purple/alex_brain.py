"""AlexBrain state for Agent 3: per-chapter learning memory plus adaptive signals.

`AlexState` wraps the existing `AlexBrain` (which the assessment and report rooms
already consume) and adds what the adaptive questioning engine needs: concept
stages, repeated-difficulty counters, asked questions, assessment feedback and a
compact running summary. All updates here are deterministic Python; model output
is only applied after validation in `apply_evaluations`.
"""

from __future__ import annotations

import re
from typing import Any, MutableMapping

from pydantic import BaseModel, Field

from .alex_engine import AlexBrain
from .alex_schemas import AssessmentFeedback, ConceptEvaluation, Readiness
from .contracts import Chapter, Concept

MAX_EVIDENCE_PER_CONCEPT = 8
MAX_HISTORY = 30
MAX_PROCESSED = 25
SUMMARY_CHAR_LIMIT = 1200

# Concept stage machine used by the strategy policy.
STAGES = ("learning", "example_requested", "apply_asked", "transfer_asked", "done")


class TurnRecord(BaseModel):
    turn: int
    turn_id: str
    modality: str
    student_text: str
    quality: str
    strategy: str
    target_concept_id: str
    question: str


class AlexState(BaseModel):
    """Everything Agent 3 remembers about one chapter. JSON-serialisable."""

    chapter_id: str
    brain: AlexBrain
    turn: int = 0
    current_concept_id: str | None = None
    current_objective_id: str | None = None
    concept_stage: dict[str, str] = Field(default_factory=dict)
    struggle_counts: dict[str, int] = Field(default_factory=dict)
    asked_questions: list[str] = Field(default_factory=list)
    history: list[TurnRecord] = Field(default_factory=list)
    summarised_concepts: list[str] = Field(default_factory=list)
    pending_feedback: AssessmentFeedback | None = None
    feedback_targets: list[str] = Field(default_factory=list)
    feedback_acknowledged: bool = True
    feedback_history: list[AssessmentFeedback] = Field(default_factory=list)
    running_summary: str = ""
    readiness: Readiness = "learning"
    reply_stats: dict[str, int] = Field(default_factory=dict)
    processed_turns: dict[str, dict] = Field(default_factory=dict)

    @classmethod
    def for_chapter(cls, chapter: Chapter) -> "AlexState":
        first = chapter.concepts[0]
        return cls(
            chapter_id=chapter.chapter_id,
            brain=AlexBrain.for_chapter(chapter),
            current_concept_id=first.id,
            current_objective_id=objective_of(chapter, first),
            concept_stage={c.id: "learning" for c in chapter.concepts},
            struggle_counts={c.id: 0 for c in chapter.concepts},
        )

    @classmethod
    def coerce(cls, value: Any, chapter: Chapter) -> "AlexState":
        """Accept an AlexState, its dict, a legacy AlexBrain (or dict), or None."""
        if value is None:
            return cls.for_chapter(chapter)
        if isinstance(value, AlexState):
            state = value.model_copy(deep=True)
        elif isinstance(value, AlexBrain):
            state = cls.for_chapter(chapter)
            state.brain = value.model_copy(deep=True)
        elif isinstance(value, dict) and "brain" in value:
            state = cls.model_validate(value)
        elif isinstance(value, dict):
            state = cls.for_chapter(chapter)
            state.brain = AlexBrain.model_validate(value)
        else:
            raise TypeError(f"Unsupported alex_brain value: {type(value).__name__}")
        if state.chapter_id != chapter.chapter_id:
            raise ValueError(
                f"AlexBrain belongs to chapter {state.chapter_id!r}, not {chapter.chapter_id!r}"
            )
        # Tolerate chapter packs that gained concepts since the state was saved.
        for concept in chapter.concepts:
            if concept.id not in state.brain.concepts:
                from .contracts import ConceptKnowledge

                state.brain.concepts[concept.id] = ConceptKnowledge(concept_id=concept.id)
            state.concept_stage.setdefault(concept.id, "learning")
            state.struggle_counts.setdefault(concept.id, 0)
        return state


class BrainStore:
    """Per-chapter save/restore on any mutable mapping (e.g. `st.session_state`)."""

    def __init__(self, storage: MutableMapping[str, Any], key: str = "purple_alex_states"):
        self.storage = storage
        self.key = key
        if key not in storage:
            storage[key] = {}

    def load(self, chapter: Chapter) -> AlexState:
        raw = self.storage[self.key].get(chapter.chapter_id)
        return AlexState.coerce(raw, chapter) if raw else AlexState.for_chapter(chapter)

    def save(self, state: AlexState) -> None:
        states = dict(self.storage[self.key])
        states[state.chapter_id] = state.model_dump(mode="json")
        self.storage[self.key] = states


# ---------------------------------------------------------------- chapter helpers


def objective_of(chapter: Chapter, concept: Concept) -> str:
    ids = {o.id for o in chapter.learning_objectives}
    if concept.objective_id in ids:
        return concept.objective_id  # type: ignore[return-value]
    return chapter.learning_objectives[0].id


def concept_by_id(chapter: Chapter, concept_id: str | None) -> Concept | None:
    return next((c for c in chapter.concepts if c.id == concept_id), None)


def is_sufficient(state: AlexState, concept_id: str) -> bool:
    """Enough teaching evidence for this concept to stop focusing on it."""
    knowledge = state.brain.concepts[concept_id]
    return (
        knowledge.level >= 2
        and bool(knowledge.supporting_evidence)
        and not knowledge.misconceptions
        and concept_id not in state.feedback_targets
        and (state.concept_stage.get(concept_id) == "done" or knowledge.level >= 3)
    )


def compute_readiness(state: AlexState, chapter: Chapter) -> Readiness:
    if any(state.brain.concepts[c.id].misconceptions for c in chapter.concepts):
        return "needs_review"
    if state.feedback_targets:
        return "needs_review"
    if all(is_sufficient(state, c.id) for c in chapter.concepts):
        return "ready_for_assessment"
    return "learning"


def next_focus_concept(state: AlexState, chapter: Chapter, exclude: str | None = None) -> Concept | None:
    """Priority: open misconceptions → assessment failures → current ILO → later ILOs."""
    candidates = [c for c in chapter.concepts if c.id != exclude]
    for concept in candidates:
        if state.brain.concepts[concept.id].misconceptions:
            return concept
    for concept in candidates:
        if concept.id in state.feedback_targets:
            return concept
    current_ilo = state.current_objective_id
    same_ilo = [c for c in candidates if objective_of(chapter, c) == current_ilo]
    for concept in same_ilo + candidates:
        if not is_sufficient(state, concept.id):
            return concept
    return None


# ------------------------------------------------------------ evidence handling


def _normalise(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def is_verbatim(quote: str, source: str) -> bool:
    """True when the quote really appears in what the student said."""
    q = _normalise(quote)
    return len(q) >= 3 and q in _normalise(source)


def apply_evaluations(
    state: AlexState,
    chapter: Chapter,
    evaluations: list[ConceptEvaluation],
    student_text: str,
    quality: str,
) -> list[ConceptEvaluation]:
    """Merge validated evaluations into AlexBrain. Returns what was actually applied.

    Rules (deterministic, independent of what the model claims):
    - unknown concept IDs are ignored;
    - evidence must be a verbatim excerpt of this turn's student words;
    - mastery rises only with evidence (one level per turn, or straight to 2 for a
      correct definition/application), never falls from correct teaching, and
      reaches 3 only with prior evidence plus an applied explanation;
    - a newly taught misconception is recorded and caps mastery at 1.
    """
    known = {c.id for c in chapter.concepts}
    applied: list[ConceptEvaluation] = []
    for evaluation in evaluations:
        if evaluation.concept_id not in known:
            continue
        knowledge = state.brain.concepts[evaluation.concept_id]
        evidence = _dedupe(
            q.strip() for q in evaluation.supporting_evidence if is_verbatim(q, student_text)
        )
        proposed = max(0, min(3, int(evaluation.mastery_level)))
        new_misconceptions = _dedupe(m.strip() for m in evaluation.misconceptions if m.strip())
        resolved = [m for m in evaluation.resolved_misconceptions if m in knowledge.misconceptions]

        if resolved and evidence and quality not in {"incorrect", "off_topic", "vague"}:
            knowledge.misconceptions = [m for m in knowledge.misconceptions if m not in resolved]
            knowledge.resolved_misconceptions = _dedupe(knowledge.resolved_misconceptions + resolved)

        if new_misconceptions:
            knowledge.misconceptions = _dedupe(knowledge.misconceptions + new_misconceptions)
            knowledge.level = min(max(knowledge.level, min(proposed, 1)), 1)
        elif evidence:
            # One level per turn, except a correct definition/application can show "understood" (2).
            ceiling = max(knowledge.level + 1, 2 if quality in {"definition_only", "applied"} else 0)
            if not (quality == "applied" and knowledge.supporting_evidence):
                ceiling = min(ceiling, 2)
            if knowledge.misconceptions:
                ceiling = min(ceiling, 1)
            concept = concept_by_id(chapter, evaluation.concept_id)
            if concept and concept.reference_quality == "weak":
                ceiling = min(ceiling, 2)  # can't verify "applied" without reference material
            knowledge.level = max(knowledge.level, min(proposed, ceiling))
            knowledge.supporting_evidence = _dedupe(knowledge.supporting_evidence + evidence)[
                -MAX_EVIDENCE_PER_CONCEPT:
            ]

        if evaluation.missing_explanations or evidence:
            knowledge.missing_points = [m for m in evaluation.missing_explanations if m.strip()][:5]
        knowledge.confidence = max(0.0, min(1.0, float(evaluation.confidence)))
        knowledge.last_updated_turn = state.turn
        applied.append(
            ConceptEvaluation(
                concept_id=evaluation.concept_id,
                mastery_level=knowledge.level,
                supporting_evidence=evidence,
                missing_explanations=list(knowledge.missing_points),
                misconceptions=new_misconceptions,
                resolved_misconceptions=resolved,
                confidence=knowledge.confidence,
            )
        )
    state.brain.turn = state.turn
    return applied


def update_running_summary(state: AlexState, window: int) -> None:
    """Compact turns that fell out of the recent window into one line each (no API call)."""
    older = state.history[:-window] if len(state.history) > window else []
    lines = [
        f"T{r.turn} {r.modality} on {r.target_concept_id}: {r.quality} → Alex {r.strategy}"
        for r in older
    ]
    summary = "; ".join(lines)
    state.running_summary = summary[-SUMMARY_CHAR_LIMIT:]


def _dedupe(values) -> list[str]:
    seen: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.append(value)
    return seen
