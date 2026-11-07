"""JSON bridge between the Next.js Teaching Room and Agent 3.

Usage: `python -m purple.web_bridge < request.json`  →  response JSON on stdout.

Commands (field `command`):
- `turn`       teach Alex (text / reviewed voice transcript / image)
- `action`     toolbar: check_memory | teach_back | give_example | challenge
- `transcribe` ElevenLabs Scribe v2 speech-to-text
- `speak`      ElevenLabs TTS for one Alex reply (cached by response ID)
- `status`     which services are configured

The web app keeps its own `BrainState` contract for the assessment room; every turn
returns both the full `alexState` (stored opaquely by the client) and a `webBrain`
in the web's existing shape. No Agent 3 logic lives in TypeScript.
"""

from __future__ import annotations

import base64
import json
import re
import sys
from typing import Any

from .alex_agent import (
    AlexConfigError,
    load_chapter_pack,
    process_teaching_turn,
    resolve_api_key,
    run_alex_action,
)
from .alex_brain import AlexState
from .alex_media import (
    VoiceUnavailable,
    image_input,
    speech_available,
    synthesize_speech,
    transcribe_audio,
    transcription_available,
)
from .alex_schemas import AssessmentFeedback, TeachingInput
from .contracts import Chapter


def web_concept_id(label: str) -> str:
    """Same slug as apps/web/src/features/purple-shared/types.ts `conceptId`."""
    return re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-") or "core-concept"


def chapter_from_request(req: dict) -> Chapter:
    game = req.get("game") or {}
    subject = (game.get("course") or {}).get("subject", "General")
    return load_chapter_pack_with_subject(req["chapter"], game.get("id", "web"), subject)


def load_chapter_pack_with_subject(raw: dict, game_id: str, subject: str) -> Chapter:
    if "ilos" in raw:
        return Chapter.from_generated_chapter(raw, game_id=game_id, subject=subject)
    return load_chapter_pack(raw, game_id)


def to_web_brain(state: AlexState, chapter: Chapter, week: int) -> dict:
    concepts = {}
    for concept in chapter.concepts:
        k = state.brain.concepts[concept.id]
        wid = web_concept_id(concept.label)
        concepts[wid] = {
            "conceptId": wid,
            "label": concept.label,
            "level": k.level,
            "evidence": k.supporting_evidence,
            "missingPoints": k.missing_points,
            "misconceptions": k.misconceptions,
            "confidence": k.confidence,
            "lastUpdatedTurn": k.last_updated_turn,
        }
    return {"chapterWeek": week, "turn": state.turn, "concepts": concepts}


def _feedback(req: dict, chapter: Chapter) -> AssessmentFeedback | None:
    raw = req.get("feedback")
    if not raw:
        return None
    by_web_id = {web_concept_id(c.label): c.id for c in chapter.concepts}
    failed = [by_web_id.get(cid, cid) for cid in raw.get("failedConcepts", [])]
    return AssessmentFeedback(
        chapter_id=chapter.chapter_id,
        failed_concepts=failed,
        alex_mistake=raw.get("alexMistake", ""),
        recommended_revision=raw.get("recommendedRevision", ""),
    )


def _history(req: dict) -> list[dict]:
    return [
        {"role": "user" if m.get("role") == "student" else "assistant", "content": m.get("text", "")}
        for m in req.get("history", [])
    ]


def handle(req: dict) -> dict:
    command = req.get("command")
    if command in MISSION_COMMANDS:
        return handle_mission(req)
    if command not in {"status", "transcribe", "speak", "turn", "action"}:
        raise ValueError(f"Unknown command {command!r}")
    if command == "status":
        return {
            "ok": True,
            "claude": bool(resolve_api_key()),
            "transcription": transcription_available(),
            "speech": speech_available(),
        }
    if command == "transcribe":
        audio = base64.b64decode(req.get("audioBase64", ""))
        mime = req.get("mime", "audio/webm")
        ext = mime.split("/")[-1].split(";")[0] or "webm"
        return {"ok": True, "text": transcribe_audio(audio, f"speech.{ext}", mime)}
    if command == "speak":
        audio = synthesize_speech(req.get("text", ""), req["responseId"])
        return {"ok": True, "audioBase64": base64.b64encode(audio).decode(), "mime": "audio/mpeg"}

    chapter = chapter_from_request(req)
    week = int(req["chapter"].get("week", 1)) if isinstance(req["chapter"], dict) else 1
    state_raw = req.get("alexState")
    state = AlexState.coerce(state_raw, chapter) if state_raw else AlexState.for_chapter(chapter)

    if command == "turn":
        if req.get("imageBase64"):
            teaching = image_input(
                base64.b64decode(req["imageBase64"]),
                req.get("imageMediaType", "image/png"),
                req.get("message", ""),
            )
        else:
            teaching = TeachingInput(text=req.get("message", ""), modality=req.get("modality", "text"))
        result = process_teaching_turn(
            chapter.game_id, chapter, state, teaching, _history(req),
            assessment_feedback=_feedback(req, chapter), turn_id=req.get("turnId"),
        )
    elif command == "action":
        result = run_alex_action(chapter.game_id, chapter, state, req["action"], turn_id=req.get("turnId"))
    else:
        raise ValueError(f"Unknown command {command!r}")

    updated = AlexState.model_validate(result.pop("updated_brain"))
    by_id = {c.id: web_concept_id(c.label) for c in chapter.concepts}
    result["target_concept_id"] = by_id.get(result.get("target_concept_id"), result.get("target_concept_id"))
    return {
        "ok": True,
        "result": result,
        "alexState": updated.model_dump(mode="json"),
        "webBrain": to_web_brain(updated, chapter, week),
    }


def main() -> int:
    try:
        req = json.loads(sys.stdin.read() or "{}")
        response = handle(req)
    except (VoiceUnavailable, AlexConfigError, ValueError, KeyError, TypeError) as exc:
        response = {"ok": False, "error": str(exc) or type(exc).__name__, "kind": type(exc).__name__}
    except Exception as exc:  # never leak a traceback to the browser
        response = {"ok": False, "error": f"Agent 3 failed ({type(exc).__name__})", "kind": "internal"}
    sys.stdout.write(json.dumps(response))
    return 0



# ------------------------------------------------------------ assessment missions

MISSION_COMMANDS = {"mission_load", "mission_decide", "mission_why", "mission_finish"}


def handle_mission(req: dict) -> dict:
    """Assessment Room: build/cached mission, deterministic decisions, transparent score."""
    from .alex_agent import ClaudeEvaluator, default_evaluator
    from .alex_prompts import ACTION_PROMPTS
    from .mission import Assist, build_mission, client_mission, decide_mission, play_mission

    chapter = chapter_from_request(req)
    game_id = (req.get("game") or {}).get("id", "web")
    state_raw = req.get("alexState")
    brain = (AlexState.coerce(state_raw, chapter) if state_raw else AlexState.for_chapter(chapter)).brain
    mission = build_mission(chapter, req.get("pack"), variant=int(req.get("variant", 0)), game_id=game_id)
    to_web = {c.id: web_concept_id(c.label) for c in chapter.concepts}
    from_web = {v: k for k, v in to_web.items()}

    def web_ids(value):
        """Recursively rename concept ids (dict keys and string values) to web slugs."""
        if isinstance(value, dict):
            return {to_web.get(k, k): web_ids(v) for k, v in value.items()}
        if isinstance(value, list):
            return [web_ids(v) for v in value]
        return to_web.get(value, value) if isinstance(value, str) else value

    def assist(raw: dict | None) -> Assist:
        raw = raw or {}
        return Assist(hint_concepts=[from_web.get(c, c) for c in raw.get("hints", [])],
                      pause_texts=[str(t) for t in raw.get("pauses", [])][:5])

    command = req["command"]
    if command == "mission_load":
        view = client_mission(mission, chapter)
        view["concepts"] = [{"id": to_web[c["id"]], "label": c["label"]} for c in view["concepts"]]
        view["hints"] = web_ids(view["hints"])
        return {"ok": True, "mission": view}

    received = [str(e) for e in req.get("received", [])]
    if command in ("mission_decide", "mission_why"):
        phase = "curveball" if req.get("phase") == "curveball" else "initial"
        decision = decide_mission(chapter, brain, mission, received, phase, assist(req.get("assist")),
                                  previous_action=req.get("previousAction"))
        out = web_ids(decision.model_dump())
        if command == "mission_why":
            line = decision.explanation
            evaluator, _ = default_evaluator()
            if isinstance(evaluator, ClaudeEvaluator):
                try:
                    known = [f"{c.label} ({brain.concepts[c.id].level}/3)" for c in chapter.concepts]
                    said = evaluator.say(chapter, ACTION_PROMPTS["explain_decision"].format(
                        action=decision.action_label, reason=decision.explanation, known="; ".join(known)))
                    line = said or line
                except Exception:
                    pass  # deterministic reason is always available
            out["why"] = line
        return {"ok": True, "decision": out}

    # mission_finish: recompute everything server-side from the player's inputs
    phases = req.get("assist") or {}
    report = play_mission(
        chapter, brain, mission, received=received,
        curveball_received=[str(e) for e in req.get("curveballReceived", [])],
        initial_assist=assist(phases.get("initial")), curveball_assist=assist(phases.get("curveball")),
        prediction=from_web.get(req.get("prediction") or "", req.get("prediction")),
    )
    report = web_ids(report)
    report["stars"] = 3 if report["score"] >= 90 else 2 if report["passed"] else 1 if report["score"] >= 40 else 0
    failed = [d for d in report["decisions"] if not d["success"]]
    report["feedback"] = None if report["passed"] and not failed else {
        "failedConcepts": report["culprit_concepts"] or report["concepts_missing"][:1],
        "alexMistake": failed[0]["explanation"] if failed else "",
        "recommendedRevision": "Re-explain " + ", ".join(
            report["labels"].get(c, c) for c in (report["culprit_concepts"] or report["concepts_missing"][:1])),
    }
    return {"ok": True, "report": report, "chapterId": chapter.chapter_id}


if __name__ == "__main__":
    sys.exit(main())
