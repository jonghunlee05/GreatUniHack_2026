import pytest

from purple.contracts import Attempt
from purple.state import initialise, key, set_room, start_repair


def test_report_navigation_is_guarded(pcb):
    state = {}
    initialise(state, pcb)
    with pytest.raises(ValueError):
        set_room(state, "report")
    attempt = Attempt.model_validate(state[key("attempt")])
    attempt.completed = True
    state[key("attempt")] = attempt.model_dump()
    set_room(state, "report")
    assert state[key("room")] == "report"


def test_repair_does_not_increase_mastery(pcb):
    state = {}
    initialise(state, pcb)
    before = state[key("brain")]["concepts"]["solder_fatigue"]["level"]
    start_repair(state, "solder_fatigue")
    after = state[key("brain")]["concepts"]["solder_fatigue"]["level"]
    assert before == after
    assert state[key("room")] == "teaching"
