"""Alex's evidence-bound knowledge engine with a robust offline evaluator."""

from __future__ import annotations

import re
import os
from collections import Counter

from pydantic import BaseModel, Field

from .contracts import Chapter, Concept, ConceptKnowledge, TeachingEvaluation

STOPWORDS = {
    "about", "after", "again", "also", "because", "being", "between", "could", "does",
    "from", "have", "into", "more", "that", "their", "then", "there", "these", "they",
    "this", "through", "when", "where", "which", "with", "would", "your", "than", "only",
}
APPLICATION_MARKERS = {"example", "if", "when", "therefore", "so", "causes", "leads", "result"}


class AlexBrain(BaseModel):
    """Serializable state. It never grants knowledge without student evidence."""

    chapter_id: str
    concepts: dict[str, ConceptKnowledge] = Field(default_factory=dict)
    turn: int = 0

    @classmethod
    def for_chapter(cls, chapter: Chapter) -> "AlexBrain":
        return cls(
            chapter_id=chapter.chapter_id,
            concepts={
                concept.id: ConceptKnowledge(concept_id=concept.id)
                for concept in chapter.concepts
            },
        )

    def evaluate_and_learn(self, chapter: Chapter, student_words: str) -> TeachingEvaluation:
        """Evaluate one explanation and merge only evidence-supported changes.

        This deterministic evaluator is deliberately conservative and keeps the MVP
        playable offline. A production LLM evaluator can return the same contract.
        """
        self.turn += 1
        concepts = {concept.id: concept for concept in chapter.concepts}
        if not student_words.strip():
            first = chapter.concepts[0]
            return TeachingEvaluation(
                concept_id=first.id,
                level=self.concepts[first.id].level,
                missing_points=first.key_points or [first.reference_explanation],
                confidence=1,
                next_question=f"What would you like to teach me about {first.label}?",
            )

        selected = max(chapter.concepts, key=lambda item: self._relevance(item, student_words))
        previous = self.concepts[selected.id]
        evaluation = None
        used_llm = False
        if os.getenv("PURPLE_LLM_API_KEY"):
            try:
                from .llm_client import evaluate_teaching

                evaluation = evaluate_teaching(chapter, previous, student_words)
                used_llm = True
            except Exception:
                # A live provider is an enhancement, never a dependency of the game loop.
                evaluation = None
        if evaluation is None:
            evaluation = self._evaluate(selected, previous, student_words)
        if evaluation.concept_id not in self.concepts:
            evaluation = self._evaluate(selected, previous, student_words)
        previous = self.concepts[evaluation.concept_id]
        # One answer cannot jump from unknown to applied, even if an LLM overclaims it.
        cap = 3 if previous.supporting_evidence else 2
        if used_llm:
            evaluation.level = min(evaluation.level, cap)
        evaluation.supporting_evidence = [student_words] if (
            evaluation.level > previous.level or evaluation.misconceptions
        ) else []
        previous.level = max(previous.level, evaluation.level)
        if student_words not in previous.supporting_evidence and evaluation.supporting_evidence:
            previous.supporting_evidence.append(student_words)
        previous.missing_points = evaluation.missing_points
        previous.misconceptions = _unique(previous.misconceptions + evaluation.misconceptions)
        previous.confidence = evaluation.confidence
        previous.last_updated_turn = self.turn
        return evaluation

    def _evaluate(
        self, concept: Concept, previous: ConceptKnowledge, words: str
    ) -> TeachingEvaluation:
        lower = words.lower()
        misconception_hits = [m for m in concept.common_misconceptions if _phrase_hit(m, lower)]
        reference_terms = _terms(" ".join([concept.reference_explanation, *concept.key_points]))
        student_terms = _terms(words)
        overlap = len(reference_terms & student_terms) / max(1, min(len(reference_terms), 10))
        point_hits = [point for point in concept.key_points if _semantic_overlap(point, words) >= 0.28]
        missing = [point for point in concept.key_points if point not in point_hits]

        if misconception_hits:
            level = min(max(previous.level, 1), 1)
            question = f"I might copy this idea: '{misconception_hits[0]}'. What evidence supports it?"
        elif overlap < 0.12 and not point_hits:
            level = previous.level
            question = f"I am not seeing the link to {concept.label} yet. Can you explain the cause and effect?"
        elif missing:
            level = max(previous.level, 1 if overlap < 0.28 else 2)
            question = f"I follow part of that. How does this connect to: {missing[0]}?"
        else:
            has_application = bool(APPLICATION_MARKERS & set(re.findall(r"[a-z]+", lower)))
            multiple_evidence = bool(previous.supporting_evidence)
            level = 3 if has_application and multiple_evidence else 2
            question = (
                f"Could you test my understanding of {concept.label} with a new example?"
                if level == 2
                else f"What boundary case might make this use of {concept.label} fail?"
            )

        return TeachingEvaluation(
            concept_id=concept.id,
            level=level,
            supporting_evidence=[words] if level > previous.level or misconception_hits else [],
            missing_points=missing,
            misconceptions=misconception_hits,
            confidence=min(0.95, 0.45 + overlap),
            next_question=question,
        )

    def _relevance(self, concept: Concept, words: str) -> float:
        label_bonus = 0.25 if concept.label.lower() in words.lower() else 0
        misconception_bonus = 1.0 if any(
            _phrase_hit(item, words.lower()) for item in concept.common_misconceptions
        ) else 0
        return _semantic_overlap(
            " ".join([concept.label, concept.reference_explanation, *concept.key_points]), words
        ) + label_bonus + misconception_bonus

    def teach_back(self, chapter: Chapter) -> list[str]:
        summaries: list[str] = []
        for concept in chapter.concepts:
            knowledge = self.concepts[concept.id]
            if knowledge.level == 0:
                summaries.append(f"I have not been taught {concept.label} yet.")
            elif knowledge.misconceptions:
                summaries.append(f"For {concept.label}, I currently believe: {knowledge.misconceptions[-1]}")
            else:
                quote = knowledge.supporting_evidence[-1] if knowledge.supporting_evidence else ""
                summaries.append(f"For {concept.label}, I learned from you: “{quote}”")
        return summaries

    @property
    def progress(self) -> float:
        if not self.concepts:
            return 0
        return sum(item.level for item in self.concepts.values()) / (3 * len(self.concepts))


def _terms(text: str) -> set[str]:
    return {
        token for token in re.findall(r"[a-z][a-z0-9-]{2,}", text.lower())
        if token not in STOPWORDS
    }


def _semantic_overlap(a: str, b: str) -> float:
    left, right = _terms(a), _terms(b)
    return len(left & right) / max(1, len(left))


def _phrase_hit(misconception: str, lower_words: str) -> bool:
    exact = misconception.lower() in lower_words
    overlap = _semantic_overlap(misconception, lower_words)
    explicit_refutation = any(
        marker in lower_words
        for marker in ("it is false that", "not true that", "the misconception is", "i disagree that")
    )
    return (exact or overlap >= 0.7) and not explicit_refutation


def _unique(values: list[str]) -> list[str]:
    return list(Counter(values))
