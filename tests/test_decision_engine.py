from purple.alex_engine import AlexBrain
from purple.decision_engine import decide
from purple.task_generator import get_assessment_task


def test_strong_and_weak_brains_choose_differently(pcb):
    task = get_assessment_task(pcb)
    weak = AlexBrain.for_chapter(pcb)
    strong = AlexBrain.for_chapter(pcb)
    for concept_id in task.required_concepts:
        strong.concepts[concept_id].level = 2
    weak_result = decide(weak, task, task.relevant_evidence_ids)
    strong_result = decide(strong, task, task.relevant_evidence_ids)
    assert not weak_result.success
    assert strong_result.success
    assert weak_result.action_id != strong_result.action_id


def test_irrelevant_evidence_does_not_grant_success(pcb):
    task = get_assessment_task(pcb)
    brain = AlexBrain.for_chapter(pcb)
    for concept_id in task.required_concepts:
        brain.concepts[concept_id].level = 3
    result = decide(brain, task, ["firmware", "colour"])
    assert not result.success


def test_misconception_controls_action(pcb):
    task = get_assessment_task(pcb)
    brain = AlexBrain.for_chapter(pcb)
    for concept_id in task.required_concepts:
        brain.concepts[concept_id].level = 2
    misconception = "If a circuit works while stationary, solder joints cannot be the problem"
    brain.concepts["solder_fatigue"].misconceptions = [misconception]
    result = decide(brain, task, task.relevant_evidence_ids)
    assert result.action_id == "replace_firmware"
