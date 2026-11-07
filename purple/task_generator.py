"""Validated assessment loading/generation with an always-playable offline fallback."""

from __future__ import annotations

import json
from pathlib import Path

from .contracts import (
    Action,
    AssessmentTask,
    Chapter,
    Curveball,
    EvidenceCard,
)

ROOT = Path(__file__).resolve().parents[1]


def get_assessment_task(chapter: Chapter, *, variant: int = 0) -> AssessmentTask:
    """Return a validated, source-grounded task without requiring a live API.

    Known demo chapters use authored JSON. Imported chapters receive a conservative
    generic evidence-discrimination task rather than blocking the game.
    """
    candidates = [
        ROOT / "examples" / f"{chapter.chapter_id}_assessment.json",
        ROOT / "examples" / "sample_assessment.json",
    ]
    for path in candidates:
        if path.exists():
            raw = json.loads(path.read_text())
            if raw.get("chapter_id") in (None, chapter.chapter_id):
                raw.pop("chapter_id", None)
                task = AssessmentTask.model_validate(raw)
                if variant:
                    return _rematch_variant(task, variant)
                return task
    task = _generic_task(chapter)
    return _rematch_variant(task, variant) if variant else task


def validate_task_for_chapter(task: AssessmentTask, chapter: Chapter) -> None:
    concept_ids = {concept.id for concept in chapter.concepts}
    objective_ids = {objective.id for objective in chapter.learning_objectives}
    if not set(task.required_concepts) <= concept_ids:
        raise ValueError("Task requires concepts absent from the chapter")
    if not set(task.learning_objectives_tested) <= objective_ids:
        raise ValueError("Task does not test a chapter learning objective")
    chapter_sources = {concept.source_ref for concept in chapter.concepts}
    if not chapter_sources.intersection(task.source_references):
        raise ValueError("Task sources are not grounded in the chapter")


def _generic_task(chapter: Chapter) -> AssessmentTask:
    concept = chapter.concepts[0]
    objective = chapter.learning_objectives[0]
    return AssessmentTask(
        task_id=f"{chapter.chapter_id}_evidence_mission",
        title=f"Mission: Apply {concept.label}",
        scenario=(
            f"A teammate proposes a solution to a new {chapter.subject} problem. "
            f"Choose whether the available evidence justifies applying {concept.label}."
        ),
        learning_objectives_tested=[objective.id],
        required_concepts=[concept.id],
        evidence_cards=[
            EvidenceCard(id="direct", title="Direct observation", detail=concept.reference_explanation,
                         source_ref=concept.source_ref),
            EvidenceCard(id="opinion", title="Unverified opinion", detail="A classmate says it usually works.",
                         source_ref="task context"),
            EvidenceCard(id="unrelated", title="Background detail", detail="The room was quiet during the trial.",
                         source_ref="task context"),
        ],
        relevant_evidence_ids=["direct"],
        allowed_actions=[
            Action(id="apply", label=f"Apply {concept.label} with the stated evidence"),
            Action(id="guess", label="Act on the unverified opinion"),
            Action(id="insufficient", label="Request stronger evidence"),
        ],
        correct_action="apply",
        success_conditions=["Use the direct source-grounded observation"],
        curveball=Curveball(
            scenario="The direct observation no longer matches the changed condition.",
            correct_action="insufficient",
            expected_reasoning="The earlier evidence cannot automatically transfer to a changed condition.",
            required_concepts=[concept.id],
        ),
        expected_reasoning=concept.reference_explanation,
        source_references=[concept.source_ref],
        answer_explanation="The direct observation is the only source-grounded evidence supplied.",
    )


def _rematch_variant(task: AssessmentTask, variant: int) -> AssessmentTask:
    raw = task.model_dump()
    raw["task_id"] = f"{task.task_id}_rematch_{variant}"
    raw["title"] = f"{task.title} · Rematch"
    raw["scenario"] = f"Rematch condition {variant}: {task.scenario} The context and readings are newly collected."
    raw["curveball"]["scenario"] = f"New rematch constraint: {task.curveball.scenario}"
    return AssessmentTask.model_validate(raw)
