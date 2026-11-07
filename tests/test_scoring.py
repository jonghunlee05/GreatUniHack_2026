from purple.alex_engine import AlexBrain
from purple.contracts import Attempt
from purple.decision_engine import decide
from purple.scoring import complete_attempt, score_attempt
from purple.task_generator import get_assessment_task


def _completed_parts(pcb):
    task = get_assessment_task(pcb)
    brain = AlexBrain.for_chapter(pcb)
    for concept_id in task.required_concepts:
        brain.concepts[concept_id].level = 3
    attempt = Attempt(
        task_id=task.task_id,
        transmitted_evidence=task.relevant_evidence_ids,
        diagnosis_concept_id=task.required_concepts[0],
    )
    attempt.decisions = [
        decide(brain, task, attempt.transmitted_evidence),
        decide(brain, task, attempt.transmitted_evidence, phase="curveball"),
    ]
    return brain, task, attempt


def test_completed_assessment_score_is_deterministic(pcb):
    brain, task, attempt = _completed_parts(pcb)
    first = score_attempt(brain, task, attempt)
    second = score_attempt(brain, task, attempt)
    assert first == second
    completed = complete_attempt(brain, task, attempt)
    assert completed.score == sum(first.values()) == 100


def test_hints_and_independent_success_are_separate(pcb):
    brain, task, attempt = _completed_parts(pcb)
    attempt.hints_used = 1
    attempt.decisions[0].assisted = True
    components = score_attempt(brain, task, attempt)
    assert components["independent_performance"] == 15
    assert attempt.hints_used == 1
