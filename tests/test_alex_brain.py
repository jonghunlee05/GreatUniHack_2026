from purple.alex_engine import AlexBrain


def test_clear_correct_teaching_increases_knowledge(pcb):
    brain = AlexBrain.for_chapter(pcb)
    result = brain.evaluate_and_learn(
        pcb,
        "Repeated board flex concentrates mechanical stress at solder joints, and microcracks create intermittent electrical continuity during movement.",
    )
    assert result.concept_id == "solder_fatigue"
    assert brain.concepts["solder_fatigue"].level == 2
    assert brain.concepts["solder_fatigue"].supporting_evidence


def test_incomplete_explanation_does_not_grant_full_mastery(pcb):
    brain = AlexBrain.for_chapter(pcb)
    brain.evaluate_and_learn(pcb, "Board flex puts mechanical stress on solder joints.")
    assert brain.concepts["solder_fatigue"].level < 3
    assert brain.concepts["solder_fatigue"].missing_points


def test_misconception_is_recorded(pcb):
    brain = AlexBrain.for_chapter(pcb)
    misconception = "If a circuit works while stationary, solder joints cannot be the problem"
    brain.evaluate_and_learn(pcb, misconception)
    assert misconception in brain.concepts["solder_fatigue"].misconceptions


def test_reteaching_can_improve_later_performance(pcb):
    brain = AlexBrain.for_chapter(pcb)
    brain.evaluate_and_learn(pcb, "A solder joint is part of a board.")
    before = brain.concepts["solder_fatigue"].level
    explanation = (
        "Repeated board flex concentrates mechanical stress at solder joints. "
        "Microcracks create intermittent electrical continuity during movement."
    )
    brain.evaluate_and_learn(pcb, explanation)
    brain.evaluate_and_learn(pcb, "For example, cable movement causes the crack to open, so the signal drops.")
    assert brain.concepts["solder_fatigue"].level > before
    assert brain.concepts["solder_fatigue"].level >= 2
