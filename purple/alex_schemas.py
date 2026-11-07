"""Structured contracts for Agent 3 (Alex, the adaptive AI apprentice).

`AlexModelOutput` is the schema Claude must return each teaching turn. It is kept
free of numeric constraints so it maps cleanly onto structured outputs; ranges are
enforced afterwards by deterministic Python validation in `alex_brain`.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Strategy = Literal[
    "CLARIFY", "CHALLENGE", "EXAMPLE", "APPLY", "TRANSFER", "SUMMARISE", "SCAFFOLD", "PROGRESS"
]
STRATEGIES: tuple[str, ...] = (
    "CLARIFY", "CHALLENGE", "EXAMPLE", "APPLY", "TRANSFER", "SUMMARISE", "SCAFFOLD", "PROGRESS"
)

# How good the student's latest explanation was, judged against the chapter pack.
Quality = Literal[
    "off_topic",        # unrelated to any chapter concept
    "vague",            # related but too vague to learn from
    "partial",          # some correct points, key points missing
    "incorrect",        # contains a misconception or unsupported claim
    "definition_only",  # correct definition, no practical demonstration
    "applied",          # correct and shows practical use / handles an application
    "confirmation",     # confirms (or corrects) Alex's summary
]
QUALITIES: tuple[str, ...] = (
    "off_topic", "vague", "partial", "incorrect", "definition_only", "applied", "confirmation"
)
WEAK_QUALITIES = frozenset({"off_topic", "vague", "partial", "incorrect"})

Readiness = Literal["learning", "needs_review", "ready_for_assessment"]
Modality = Literal["text", "voice", "image"]
Mode = Literal["claude", "offline-demo", "offline-fallback", "cached"]


class ConceptEvaluation(BaseModel):
    concept_id: str
    mastery_level: int = Field(description="0 not taught, 1 recognised, 2 understood, 3 applied")
    supporting_evidence: list[str] = Field(
        description="Exact quotes copied from the student's words this turn. Never paraphrase."
    )
    missing_explanations: list[str]
    misconceptions: list[str] = Field(description="Incorrect ideas the student taught this turn")
    resolved_misconceptions: list[str] = Field(
        description="Earlier misconceptions the student explicitly corrected this turn"
    )
    confidence: float = Field(description="0 to 1")


class AlexModelOutput(BaseModel):
    """Exactly what the evaluator (Claude or offline) returns for one turn."""

    explanation_quality: Quality
    target_concept_id: str
    response_strategy: Strategy
    updated_concept_evaluations: list[ConceptEvaluation]
    alex_reply: str = Field(description="Alex's reply: 1-3 short sentences, one question")
    next_question: str = Field(description="The single question contained in alex_reply")
    image_observations: str = Field(description="What the image shows; empty string if no image")
    teaching_progress_summary: str = Field(description="One sentence on what Alex has learned so far")


class AlexLine(BaseModel):
    """Short in-character line for toolbar actions (teach-back, example, challenge)."""

    alex_reply: str = Field(description="1-3 short sentences ending with one question")


Reaction = Literal["curious", "confused", "thinking", "understanding", "got_it"]


class AssessmentFeedback(BaseModel):
    chapter_id: str
    failed_concepts: list[str] = Field(default_factory=list)
    alex_mistake: str = ""
    recommended_revision: str = ""


class TeachingInput(BaseModel):
    """Unified input for text, reviewed voice transcripts, and images."""

    text: str = ""
    modality: Modality = "text"
    image_bytes: bytes | None = None
    image_media_type: str | None = None

    @property
    def has_image(self) -> bool:
        return bool(self.image_bytes)


class TeachingTurnResult(BaseModel):
    """Returned by `process_teaching_turn`; also stored for duplicate-submission replay."""

    turn_id: str
    mode: Mode
    alex_reply: str
    strategy: Strategy
    response_strategy: Strategy
    target_concept_id: str
    explanation_quality: Quality
    updated_concept_evaluations: list[ConceptEvaluation]
    supporting_evidence: list[str]
    misconceptions: list[str]
    next_question: str
    readiness: Readiness
    readiness_status: Readiness
    teaching_progress_summary: str
    image_observations: str = ""
    reply_source: Literal["model", "template"] = "template"
    reaction: Reaction = "curious"
    template_rate: float | None = None
    warnings: list[str] = Field(default_factory=list)
    updated_brain: dict = Field(default_factory=dict)
