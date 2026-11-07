"""Namespaced Streamlit state and guarded room transitions."""

from __future__ import annotations

from typing import Any, MutableMapping

from .alex_engine import AlexBrain
from .contracts import Attempt, Chapter
from .task_generator import get_assessment_task

PREFIX = "purple_"
ROOMS = {"teaching", "assessment", "report"}


def key(name: str) -> str:
    return f"{PREFIX}{name}"


def initialise(state: MutableMapping[str, Any], chapter: Chapter) -> None:
    if state.get(key("chapter_id")) == chapter.chapter_id:
        return
    state[key("chapter_id")] = chapter.chapter_id
    state[key("room")] = "teaching"
    # Restore this chapter's Agent 3 state and conversation if it was taught before.
    from .alex_agent import opening_message
    from .alex_brain import AlexState

    saved = state.get(key("alex_states"), {}).get(chapter.chapter_id)
    alex_state = AlexState.coerce(saved, chapter) if saved else AlexState.for_chapter(chapter)
    state[key("brain")] = alex_state.brain.model_dump()
    saved_conversation = state.get(key("conversations"), {}).get(chapter.chapter_id)
    state[key("conversation")] = list(saved_conversation) if saved_conversation else [
        {"role": "assistant", "content": opening_message(chapter, alex_state)}
    ]
    state[key("feedback_sent")] = False
    state[key("task")] = get_assessment_task(chapter).model_dump()
    state[key("attempt")] = Attempt(task_id=state[key("task")]["task_id"]).model_dump()
    state[key("assessment_phase")] = "evidence"
    state[key("repair_target")] = None
    state[key("attempt_history")] = []
    state[key("rematch_number")] = 0


def set_room(state: MutableMapping[str, Any], room: str) -> None:
    if room not in ROOMS:
        raise ValueError(f"Unknown room: {room}")
    if room == "report" and not Attempt.model_validate(state[key("attempt")]).completed:
        raise ValueError("Assessment must be completed before opening the report")
    state[key("room")] = room


def start_repair(state: MutableMapping[str, Any], concept_id: str) -> None:
    state[key("repair_target")] = concept_id
    state[key("feedback_sent")] = False
    state[key("room")] = "teaching"


def start_rematch(state: MutableMapping[str, Any], chapter: Chapter) -> None:
    current = Attempt.model_validate(state[key("attempt")])
    if not current.completed:
        raise ValueError("Complete the current attempt before a rematch")
    state[key("attempt_history")].append(current.model_dump())
    number = int(state[key("rematch_number")]) + 1
    task = get_assessment_task(chapter, variant=number)
    state[key("rematch_number")] = number
    state[key("task")] = task.model_dump()
    state[key("attempt")] = Attempt(task_id=task.task_id).model_dump()
    state[key("assessment_phase")] = "evidence"
    state[key("repair_target")] = None
    state[key("room")] = "assessment"
