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
    state[key("brain")] = AlexBrain.for_chapter(chapter).model_dump()
    state[key("conversation")] = [
        {"role": "assistant", "content": f"Hi! I know very little about {chapter.title}. What should I learn first?"}
    ]
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
