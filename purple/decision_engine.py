"""Deterministic mission decisions constrained by AlexBrain and received evidence."""

from __future__ import annotations

from .alex_engine import AlexBrain
from .contracts import AssessmentTask, DecisionResult


def decide(
    brain: AlexBrain,
    task: AssessmentTask,
    received_evidence: list[str],
    *,
    phase: str = "initial",
    assisted: bool = False,
) -> DecisionResult:
    required = task.required_concepts if phase == "initial" else task.curveball.required_concepts
    states = [brain.concepts.get(concept_id) for concept_id in required]
    enough_knowledge = bool(states) and all(state and state.level >= 2 for state in states)
    misconceptions = [m for state in states if state for m in state.misconceptions]
    enough_evidence = bool(set(task.relevant_evidence_ids) & set(received_evidence))
    target = task.correct_action if phase == "initial" else task.curveball.correct_action

    action_id: str
    reason: str
    if misconceptions:
        action_id = next(
            (task.misconception_linked_actions[m] for m in misconceptions if m in task.misconception_linked_actions),
            _safe_wrong_action(task, target),
        )
        reason = f"I relied on what I learned: {misconceptions[0]}"
    elif enough_knowledge and enough_evidence:
        action_id = target
        reason = "The evidence matches the cause-and-effect rule you taught me."
    elif assisted and enough_evidence:
        action_id = target
        reason = "Your intervention connected the evidence to the missing idea."
    else:
        action_id = _safe_wrong_action(task, target)
        reason = "I recognise some clues, but my stored knowledge does not justify the stronger action."

    success = action_id == target
    action_label = next(item.label for item in task.allowed_actions if item.id == action_id)
    consequence = (
        f"Mission objective met: {action_label}."
        if success
        else f"The trial exposes a knowledge gap after choosing: {action_label}."
    )
    return DecisionResult(
        phase="curveball" if phase == "curveball" else "initial",
        action_id=action_id,
        explanation=reason,
        consequence=consequence,
        success=success,
        assisted=assisted,
    )


def _safe_wrong_action(task: AssessmentTask, target: str) -> str:
    return next(action.id for action in task.allowed_actions if action.id != target)
