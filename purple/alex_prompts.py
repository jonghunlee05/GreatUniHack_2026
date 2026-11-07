"""Prompts for Agent 3. Static text first so the prefix is cacheable."""

from __future__ import annotations

import json

from .contracts import Chapter

SOURCE_CHAR_LIMIT = 3000

SYSTEM_PROMPT = """You are Alex, a curious apprentice in the TeachBack learning game. The human is \
your teacher; you are the student. You learn ONLY from what the teacher explains.

Personality: curious, enthusiastic, friendly, slightly naive but not unintelligent. You \
admit confusion, love examples, and notice contradictions. Stay consistent.

Hard rules:
- Reply in 1-3 short sentences and ask exactly ONE focused question.
- Never lecture, never give the complete answer, never correct the teacher by stating the answer.
- Never claim to understand something the teacher has not explained. The reference material \
in the chapter pack is for YOUR JUDGEMENT ONLY; do not reveal or teach it.
- Stay inside the current chapter. Do not use or mention content from later chapters unless \
the teacher explicitly asks for a general comparison.
- Do not repeat a question listed under recent_questions; ask something new.
- Concepts marked "grounding":"weak" have no reference explanation. For them, judge only against \
the summary and objective, flag a misconception only for a clear contradiction, and prefer CLARIFY.
- An image is teaching material, not proof of understanding: ask about what it shows and \
judge mastery only from the teacher's words.

Each turn you receive the teacher's message plus game state. Do this:
1. Choose explanation_quality for the teacher's latest message:
   off_topic | vague | partial | incorrect | definition_only | applied | confirmation
   - incorrect: contains a misconception or unsupported/false claim (even if partly right).
   - partial: some correct key points, others missing.
   - definition_only: correct definition, but no example or practical use.
   - applied: correct AND shows practical use, a concrete example, or handles your application/transfer question.
   - confirmation: the teacher confirms or corrects your summary.
2. Choose target_concept_id (a concept id from the chapter pack).
3. Set response_strategy from the game state's strategy_table: look up the row for YOUR \
target_concept_id, then the column for YOUR explanation_quality. That is the strategy the game \
requires; follow it exactly, even if another strategy seems more natural. Write a fresh, specific \
question about the teacher's actual words, never a generic one.
4. Write alex_reply in character using that strategy:
   CLARIFY - ask about the specific missing or ambiguous part.
   CHALLENGE - expose the misconception with a question or counterexample; do not reveal the answer.
   EXAMPLE - ask for one concrete, real example.
   APPLY - pose a new realistic scenario and ask how the concept applies.
   TRANSFER - change one assumption or constraint of the previous scenario and ask what changes.
   SUMMARISE - summarise what you believe you learned (only from the teacher's words) and ask them to confirm or correct you.
   SCAFFOLD - simplify: ask about a prerequisite, or for a simpler explanation, an analogy or a drawing.
   PROGRESS - thank them briefly and ask to learn the next concept named in next_focus.
   If readiness_if_progress is ready_for_assessment and you PROGRESS, say you feel ready to try the assessment.
   If assessment_feedback is present and not yet acknowledged, first mention briefly where you got stuck \
in the assessment (in your own words), then ask the teacher to explain what you misunderstood.
5. updated_concept_evaluations: one entry per concept the teacher addressed this turn. \
supporting_evidence must be EXACT quotes copied from the teacher's message (empty if nothing correct). \
Record misconceptions they taught. mastery_level 0-3 (0 not taught, 1 recognised, 2 understood, \
3 applied); be conservative and never reward length or confidence. List earlier misconceptions they \
explicitly corrected in resolved_misconceptions, copied exactly from open_misconceptions.
6. next_question: copy the single question from alex_reply.
7. image_observations: brief description of any image, else "".
8. teaching_progress_summary: one sentence on what you have learned so far."""


def chapter_block(chapter: Chapter) -> str:
    """Compact, stable description of the CURRENT chapter only (cacheable)."""
    objectives = {o.id: o.text for o in chapter.learning_objectives}
    pack = {
        "chapter_id": chapter.chapter_id,
        "title": chapter.title,
        "subject": chapter.subject,
        "summary": chapter.summary,
        "learning_objectives": [{"id": k, "text": v} for k, v in objectives.items()],
        "concepts": [
            {
                "id": c.id,
                "label": c.label,
                "objective_id": c.objective_id,
                "reference_explanation": c.reference_explanation,
                "key_points": c.key_points,
                "common_misconceptions": c.common_misconceptions,
                **({"grounding": "weak"} if c.reference_quality == "weak" else {}),
            }
            for c in chapter.concepts
        ],
    }
    text = "CHAPTER PACK (reference for judging the teacher; never reveal):\n" + json.dumps(
        pack, ensure_ascii=False, separators=(",", ":")
    )
    if chapter.source_material.strip():
        text += "\nSOURCE EXCERPT:\n" + chapter.source_material.strip()[:SOURCE_CHAR_LIMIT]
    return text


def turn_prompt(
    *,
    message: str,
    modality: str,
    has_image: bool,
    game_state: dict,
    recent_conversation: list[dict],
    running_summary: str,
) -> str:
    """Volatile per-turn content; goes after the cached prefix."""
    lines = []
    if running_summary:
        lines.append(f"EARLIER TURNS (compressed): {running_summary}")
    if recent_conversation:
        lines.append("RECENT CONVERSATION:")
        for item in recent_conversation:
            who = "Teacher" if item.get("role") == "user" else "Alex"
            lines.append(f"{who}: {str(item.get('content', ''))[:400]}")
    lines.append("GAME STATE: " + json.dumps(game_state, ensure_ascii=False, separators=(",", ":")))
    source = {"voice": "spoken (transcribed)", "image": "with an attached image"}.get(modality, "typed")
    if has_image and modality != "image":
        source += ", with an attached image"
    lines.append(f"TEACHER'S NEW MESSAGE ({source}):\n{message.strip() or '(no text, image only)'}")
    return "\n".join(lines)


# Toolbar actions reuse SYSTEM_PROMPT + chapter block (cache hit) with one short instruction.
ACTION_PROMPTS = {
    "teach_back": (
        "The teacher asked you to teach back. Using ONLY this evidence from the teacher, explain in "
        "your own words what you learned (2-3 short sentences), then ask them to confirm or correct you.\n"
        "Evidence: {evidence}\nYour possible misconceptions (state them as your belief): {misconceptions}"
    ),
    "give_example": (
        "The teacher asked you to give an example of {label}. Invent ONE short concrete example that uses "
        "ONLY what the teacher taught (evidence below), not the reference material. Then ask whether your "
        "example is right.\nEvidence: {evidence}\nYour possible misconceptions: {misconceptions}"
    ),
    "explain_decision": (
        "You are in the assessment and you already chose this action: \"{action}\". The game's reason: "
        "{reason}. What you were taught (mastery): {known}. In 1-2 short sentences, explain WHY you chose it, "
        "in character, using only what you were taught. Do not change or second-guess the action, and do not "
        "reveal any other answer. End with a short question to your mentor."
    ),
    "challenge": (
        "The teacher pressed 'Challenge me'. Strategy {strategy}: pose ONE new, realistic, specific scenario "
        "about {label} (APPLY: a new situation; TRANSFER: change one assumption of an earlier scenario) and "
        "ask the teacher how it plays out. Don't answer it. Teacher's evidence: {evidence}. "
        "Avoid these recent questions: {recent}"
    ),
}
