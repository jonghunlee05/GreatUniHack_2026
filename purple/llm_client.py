"""Small optional OpenAI-compatible structured evaluator.

Set PURPLE_LLM_API_KEY, PURPLE_LLM_MODEL, and optionally PURPLE_LLM_BASE_URL.
Provider failures fall back to the deterministic evaluator in AlexBrain.
"""

from __future__ import annotations

import json
import os

import requests

from .contracts import Chapter, ConceptKnowledge, TeachingEvaluation


def evaluate_teaching(
    chapter: Chapter, previous: ConceptKnowledge, student_words: str
) -> TeachingEvaluation:
    api_key = os.environ["PURPLE_LLM_API_KEY"]
    model = os.getenv("PURPLE_LLM_MODEL", "gpt-4.1-mini")
    base_url = os.getenv("PURPLE_LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    grounding = [
        {
            "id": item.id,
            "label": item.label,
            "reference_explanation": item.reference_explanation,
            "key_points": item.key_points,
            "common_misconceptions": item.common_misconceptions,
            "source_ref": item.source_ref,
        }
        for item in chapter.concepts
    ]
    prompt = {
        "chapter": chapter.title,
        "grounded_concepts": grounding,
        "previous_state": previous.model_dump(),
        "student_exact_words": student_words,
        "rules": [
            "Evaluate only claims evidenced in student_exact_words against grounded_concepts.",
            "Do not reward length, confidence, or pretrained knowledge.",
            "Level is 0 unknown, 1 recognised, 2 understood, 3 applied.",
            "Return exactly one focused question and do not reveal the answer.",
            "Keep supporting_evidence as the student's exact wording.",
        ],
    }
    schema = TeachingEvaluation.model_json_schema()
    response = requests.post(
        f"{base_url}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "temperature": 0.1,
            "messages": [
                {"role": "system", "content": "You are Alex's source-grounded learning-state evaluator."},
                {"role": "user", "content": json.dumps(prompt)},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "teaching_evaluation", "strict": True, "schema": schema},
            },
        },
        timeout=20,
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    return TeachingEvaluation.model_validate_json(content)
