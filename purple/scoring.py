"""Transparent, deterministic score calculation."""

from .alex_engine import AlexBrain
from .contracts import AssessmentTask, Attempt


def score_attempt(brain: AlexBrain, task: AssessmentTask, attempt: Attempt) -> dict[str, int]:
    relevant_states = [brain.concepts[c] for c in task.required_concepts if c in brain.concepts]
    teaching = round(30 * sum(s.level / 3 for s in relevant_states) / max(1, len(relevant_states)))
    initial = next((d for d in attempt.decisions if d.phase == "initial"), None)
    curveball = next((d for d in attempt.decisions if d.phase == "curveball"), None)
    independent = 30 if initial and initial.success and not initial.assisted else 15 if initial and initial.success else 0
    transfer = 15 if curveball and curveball.success and not curveball.assisted else 7 if curveball and curveball.success else 0
    sent = set(attempt.transmitted_evidence)
    relevant = set(task.relevant_evidence_ids)
    evidence = round(10 * len(sent & relevant) / max(1, len(relevant)))
    if sent - relevant:
        evidence = max(0, evidence - 2 * len(sent - relevant))
    diagnosis = 15 if attempt.diagnosis_concept_id in task.required_concepts else 0
    return {
        "teaching_accuracy": teaching,
        "independent_performance": independent,
        "knowledge_transfer": transfer,
        "evidence_selection": evidence,
        "diagnosis": diagnosis,
    }


def complete_attempt(brain: AlexBrain, task: AssessmentTask, attempt: Attempt) -> Attempt:
    if len({decision.phase for decision in attempt.decisions}) < 2:
        raise ValueError("Both initial and curveball decisions are required")
    attempt.score_components = score_attempt(brain, task, attempt)
    attempt.score = sum(attempt.score_components.values())
    attempt.completed = True
    return attempt
