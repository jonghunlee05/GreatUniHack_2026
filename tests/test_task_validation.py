import pytest

from purple.contracts import AssessmentTask
from purple.task_generator import get_assessment_task, validate_task_for_chapter


def test_offline_tasks_work_for_two_subjects(chapter, monkeypatch):
    for name in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    task = get_assessment_task(chapter)
    validate_task_for_chapter(task, chapter)
    assert 3 <= len(task.evidence_cards) <= 5


def test_validator_rejects_missing_relevant_card(pcb):
    raw = get_assessment_task(pcb).model_dump()
    raw["relevant_evidence_ids"] = ["does_not_exist"]
    with pytest.raises(ValueError):
        AssessmentTask.model_validate(raw)


def test_imports_justins_current_schema():
    from purple.contracts import Chapter

    chapter = Chapter.from_generated_chapter(
        {
            "week": 2,
            "title": "Control",
            "summary": "Feedback changes a system response.",
            "ilos": [{"id": "W2.1", "statement": "Explain feedback", "keyConcepts": ["Feedback"]}],
            "sourceRefs": [{"file": "notes.pdf", "location": "p. 4"}],
        },
        game_id="game-1",
        subject="Engineering",
    )
    assert chapter.chapter_id == "week_2"
    assert chapter.concepts[0].id == "feedback"
