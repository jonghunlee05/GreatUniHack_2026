"""Serializable contracts shared by the purple rooms and the main app."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class LearningObjective(BaseModel):
    id: str
    text: str


class Concept(BaseModel):
    id: str
    label: str
    reference_explanation: str
    key_points: list[str] = Field(default_factory=list)
    common_misconceptions: list[str] = Field(default_factory=list)
    source_ref: str = "generated chapter"
    objective_id: str | None = None
    # "weak" when the pack has no real reference explanation (e.g. web-generated chapters).
    reference_quality: Literal["full", "weak"] = "full"


class Chapter(BaseModel):
    game_id: str = "standalone"
    chapter_id: str
    title: str
    subject: str = "General"
    summary: str = ""
    learning_objectives: list[LearningObjective]
    concepts: list[Concept]
    source_material: str = ""

    @model_validator(mode="after")
    def has_teachable_content(self) -> "Chapter":
        if not self.learning_objectives or not self.concepts:
            raise ValueError("A chapter needs at least one objective and one concept")
        ids = [concept.id for concept in self.concepts]
        if len(ids) != len(set(ids)):
            raise ValueError("Concept IDs must be unique")
        return self

    @classmethod
    def from_generated_chapter(
        cls, raw: dict[str, Any], *, game_id: str = "imported", subject: str = "General"
    ) -> "Chapter":
        """Adapt Justin's current TypeScript Chapter schema without changing his code.

        The generator currently supplies concept names but not reference explanations.
        Those names and the chapter summary are retained as provisional grounding; a
        future generator can pass a native purple Chapter JSON for stronger evaluation.
        """
        objectives = [
            LearningObjective(id=ilo["id"], text=ilo.get("statement", ""))
            for ilo in raw.get("ilos", [])
        ]
        seen: set[str] = set()
        concepts: list[Concept] = []
        source_refs = raw.get("sourceRefs", [])
        source = "; ".join(
            f"{item.get('file', 'source')} ({item.get('location', '')})" for item in source_refs
        ) or "generated chapter"
        for ilo in raw.get("ilos", []):
            for name in ilo.get("keyConcepts", []):
                concept_id = _slug(name)
                if concept_id in seen:
                    continue
                seen.add(concept_id)
                concepts.append(
                    Concept(
                        id=concept_id,
                        label=name,
                        reference_explanation=raw.get("summary", "") or ilo.get("statement", name),
                        key_points=[ilo.get("statement", name)],
                        source_ref=source,
                        objective_id=ilo.get("id"),
                        reference_quality="weak",
                    )
                )
        if not concepts:
            concepts = [
                Concept(
                    id="chapter_core",
                    label=raw.get("title", "Chapter core concept"),
                    reference_explanation=raw.get("summary", raw.get("title", "")),
                    key_points=[obj.text for obj in objectives],
                    source_ref=source,
                    reference_quality="weak",
                )
            ]
        if not objectives:
            objectives = [LearningObjective(id="chapter.1", text=raw.get("summary", raw["title"]))]
        return cls(
            game_id=game_id,
            chapter_id=f"week_{raw.get('week', 1)}",
            title=raw["title"],
            subject=subject,
            summary=raw.get("summary", ""),
            learning_objectives=objectives,
            concepts=concepts,
        )


class ConceptKnowledge(BaseModel):
    concept_id: str
    level: int = Field(default=0, ge=0, le=3)
    supporting_evidence: list[str] = Field(default_factory=list)
    missing_points: list[str] = Field(default_factory=list)
    misconceptions: list[str] = Field(default_factory=list)
    resolved_misconceptions: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0, le=1)
    last_updated_turn: int = 0


class TeachingEvaluation(BaseModel):
    concept_id: str
    level: int = Field(ge=0, le=3)
    supporting_evidence: list[str] = Field(default_factory=list)
    missing_points: list[str] = Field(default_factory=list)
    misconceptions: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0, le=1)
    next_question: str


class EvidenceCard(BaseModel):
    id: str
    title: str
    detail: str
    source_ref: str


class Action(BaseModel):
    id: str
    label: str


class Curveball(BaseModel):
    scenario: str
    correct_action: str
    expected_reasoning: str
    required_concepts: list[str]


class AssessmentTask(BaseModel):
    task_id: str
    title: str
    scenario: str
    learning_objectives_tested: list[str]
    required_concepts: list[str]
    evidence_cards: list[EvidenceCard]
    relevant_evidence_ids: list[str]
    allowed_actions: list[Action]
    correct_action: str
    misconception_linked_actions: dict[str, str] = Field(default_factory=dict)
    success_conditions: list[str]
    curveball: Curveball
    expected_reasoning: str
    source_references: list[str]
    answer_explanation: str

    @model_validator(mode="after")
    def validate_task(self) -> "AssessmentTask":
        action_ids = {action.id for action in self.allowed_actions}
        evidence_ids = {card.id for card in self.evidence_cards}
        if self.correct_action not in action_ids or self.curveball.correct_action not in action_ids:
            raise ValueError("Correct actions must be allowed actions")
        if not set(self.relevant_evidence_ids) <= evidence_ids:
            raise ValueError("Relevant evidence must name existing cards")
        if not self.required_concepts or not self.learning_objectives_tested:
            raise ValueError("Task must test an objective and at least one concept")
        if not self.expected_reasoning.strip() or not self.source_references:
            raise ValueError("Task answer must be reasoned and source-grounded")
        if not 3 <= len(self.evidence_cards) <= 5:
            raise ValueError("Evidence Hunt needs 3–5 evidence cards")
        if len(action_ids) != len(self.allowed_actions):
            raise ValueError("Action IDs must be unique")
        return self


class TrialEvent(BaseModel):
    kind: str
    detail: str
    phase: str
    assisted: bool = False
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class DecisionResult(BaseModel):
    phase: Literal["initial", "curveball"]
    action_id: str
    explanation: str
    consequence: str
    success: bool
    assisted: bool = False


class Attempt(BaseModel):
    task_id: str
    inspected_evidence: list[str] = Field(default_factory=list)
    transmitted_evidence: list[str] = Field(default_factory=list)
    hints_used: int = 0
    pause_teachings: int = 0
    diagnosis_concept_id: str | None = None
    decisions: list[DecisionResult] = Field(default_factory=list)
    events: list[TrialEvent] = Field(default_factory=list)
    completed: bool = False
    score_components: dict[str, int] = Field(default_factory=dict)
    score: int | None = None


def _slug(value: str) -> str:
    return "_".join("".join(ch.lower() if ch.isalnum() else " " for ch in value).split())
