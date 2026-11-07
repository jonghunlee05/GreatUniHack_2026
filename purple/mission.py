"""Assessment missions for the web Assessment Room (one engine, any subject).

A mission is the existing `AssessmentTask` contract plus what the interactive room
needs (concept mapping, hints, curveball evidence, scoring weights). It is built
once per chapter and variant from Agent 2's cached Chapter Pack `assessment`
section, or from authored/demo data, validated, and cached on disk.

Alex's decisions are deterministic: he can only pick one of the mission's validated
actions, and which one depends solely on his AlexBrain, the evidence the player sent,
and any assistance. Claude may phrase an explanation (`explain_decision`) but never
chooses or changes the action.
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from .alex_engine import AlexBrain, _semantic_overlap
from .contracts import Action, AssessmentTask, Chapter, Concept, Curveball, EvidenceCard
from .task_generator import get_assessment_task

ROOT = Path(__file__).resolve().parents[1]
MISSION_DIR = ROOT / "apps" / "web" / "data" / "missions"
DEFAULT_WEIGHTS = {"evidence": 30, "decision": 40, "curveball": 30}
DEFAULT_PASS = 65
MORE_EVIDENCE = "more_evidence"
CURVEBALL_CARD = "cb_new"


class Mission(BaseModel):
    task: AssessmentTask
    source: Literal["chapter_pack", "authored", "demo"]
    variant: int = 0
    weights: dict[str, int] = Field(default_factory=lambda: dict(DEFAULT_WEIGHTS))
    pass_mark: int = DEFAULT_PASS
    curveball_evidence: list[EvidenceCard] = Field(default_factory=list)
    # Brain concept id → action Alex takes when that concept is missing (pack "likely mistakes").
    mistake_actions: dict[str, str] = Field(default_factory=dict)
    why_wrong: dict[str, str] = Field(default_factory=dict)
    hints: dict[str, str] = Field(default_factory=dict)
    objective: str = ""


class Assist(BaseModel):
    hint_concepts: list[str] = Field(default_factory=list)
    pause_texts: list[str] = Field(default_factory=list)

    @property
    def used(self) -> bool:
        return bool(self.hint_concepts or self.pause_texts)


class MissionDecision(BaseModel):
    phase: Literal["initial", "curveball"]
    action_id: str
    action_label: str
    success: bool
    assisted: bool
    explanation: str
    consequence: str
    culprit_concept: str | None = None


# ------------------------------------------------------------------ building


def build_mission(chapter: Chapter, pack: dict | None = None, *, variant: int = 0,
                  game_id: str | None = None, use_cache: bool = True) -> Mission:
    """Cached, validated mission for this chapter and variant."""
    path = _cache_path(game_id or chapter.game_id, chapter.chapter_id, variant)
    if use_cache and path and path.exists():
        try:
            return Mission.model_validate_json(path.read_text())
        except ValueError:
            pass  # corrupt cache: rebuild
    mission: Mission | None = None
    if pack and pack.get("assessment"):
        try:
            mission = _from_pack(chapter, pack, variant)
        except (KeyError, ValueError, TypeError):
            mission = None  # malformed pack: fall back below, never crash the room
    if mission is None:
        task = get_assessment_task(chapter, variant=variant)
        authored = (ROOT / "examples" / f"{chapter.chapter_id}_assessment.json").exists()
        mission = _from_task(chapter, task, "authored" if authored else "demo", variant)
    if use_cache and path:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(mission.model_dump_json(indent=2))
        except OSError:
            pass
    return mission


def _cache_path(game_id: str, chapter_id: str, variant: int) -> Path | None:
    safe = all(ch.isalnum() or ch in "-_" for ch in f"{game_id}{chapter_id}")
    return MISSION_DIR / game_id / f"{chapter_id}-v{variant}.json" if safe else None


def map_concept(chapter: Chapter, statement: str) -> str:
    """Pack concept statement → closest brain concept in this chapter."""
    def score(concept: Concept) -> float:
        text = " ".join([concept.label, concept.reference_explanation, *concept.key_points])
        return _semantic_overlap(statement, text) + _semantic_overlap(concept.label, statement)
    return max(chapter.concepts, key=score).id


def _from_pack(chapter: Chapter, pack: dict, variant: int) -> Mission:
    a = pack["assessment"]
    concept_map = {c["id"]: map_concept(chapter, c["statement"]) for c in pack.get("concepts", [])}
    to_brain = lambda ids: list(dict.fromkeys(concept_map[i] for i in ids if i in concept_map))  # noqa: E731
    labels = {c.id: c.label for c in chapter.concepts}

    raw_cards = a["stage1_investigate"]["evidence"]
    relevant = [e for e in raw_cards if e.get("relevant")]
    others = [e for e in raw_cards if not e.get("relevant")]
    chosen = (relevant[:4] + others)[:5]
    cards = [EvidenceCard(id=e["id"], title=e["title"], detail=e["text"], source_ref="chapter pack") for e in chosen]
    for filler_id, title, detail in (
        ("x_opinion", "Unverified opinion", "Someone on the team says the first idea that came to mind is probably right."),
        ("x_background", "Background detail", "The meeting where this was discussed ran ten minutes late."),
    ):
        if len(cards) < 3:
            cards.append(EvidenceCard(id=filler_id, title=title, detail=detail, source_ref="mission context"))

    s2, s3 = a["stage2_alex_decides"], a["stage3_curveball"]
    actions = [Action(id="decide", label=s2["correct_decision"])]
    mistake_actions, why_wrong = {}, {}
    for mistake in s2.get("likely_mistakes", []):
        actions.append(Action(id=mistake["id"], label=mistake["alex_says"]))
        why_wrong[mistake["id"]] = mistake.get("why_wrong", "")
        concept = concept_map.get(mistake.get("missing_concept", ""))
        if concept and concept not in mistake_actions:
            mistake_actions[concept] = mistake["id"]
    actions.append(Action(id="adapt", label=s3["correct_response"]))
    actions.append(Action(id=MORE_EVIDENCE, label="Hold off and ask for more evidence"))
    why_wrong[MORE_EVIDENCE] = "Alex couldn't connect the evidence to what he was taught, so he stalled."

    required = to_brain(s2.get("requires_concepts", [])) or [chapter.concepts[0].id]
    curve_required = to_brain(s3.get("tests_concepts", [])) or required
    briefing = a["briefing"]
    task = AssessmentTask(
        task_id=f"{chapter.chapter_id}_mission",
        title=briefing["title"],
        scenario=f"{briefing['situation']} {briefing['task']}".strip(),
        learning_objectives_tested=[chapter.learning_objectives[0].id],
        required_concepts=required,
        evidence_cards=cards,
        relevant_evidence_ids=[c.id for c in cards if any(e["id"] == c.id for e in relevant)] or [cards[0].id],
        allowed_actions=actions,
        correct_action="decide",
        success_conditions=[s2.get("decision_prompt", "Choose the justified action")],
        curveball=Curveball(scenario=s3["new_condition"], correct_action="adapt",
                            expected_reasoning=s3["correct_response"], required_concepts=curve_required),
        expected_reasoning=s2["correct_decision"],
        source_references=["chapter pack"],
        answer_explanation=s2["correct_decision"],
    )
    scoring = a.get("scoring") or {}
    total = sum(int(scoring.get(k, 0)) for k in ("stage1_points", "stage2_points", "stage3_points"))
    weights, pass_mark = dict(DEFAULT_WEIGHTS), DEFAULT_PASS
    if total > 0:
        weights = {
            "evidence": round(100 * scoring.get("stage1_points", 0) / total),
            "decision": round(100 * scoring.get("stage2_points", 0) / total),
        }
        weights["curveball"] = 100 - weights["evidence"] - weights["decision"]
        if 0 < int(scoring.get("pass_mark", 0)) <= total:
            pass_mark = round(100 * int(scoring["pass_mark"]) / total)
    statements = {concept_map[c["id"]]: c["statement"] for c in pack.get("concepts", []) if c["id"] in concept_map}
    hints = {cid: f"Remind Alex: {statements.get(cid, labels[cid])}" for cid in set(required + curve_required)}
    mission = Mission(
        task=task, source="chapter_pack", variant=variant, weights=weights, pass_mark=pass_mark,
        curveball_evidence=_curveball_cards(s3["new_condition"]), mistake_actions=mistake_actions,
        why_wrong=why_wrong, hints=hints, objective=briefing.get("objective", ""),
    )
    return _apply_variant(mission, variant)


def _from_task(chapter: Chapter, task: AssessmentTask, source: str, variant: int) -> Mission:
    labels = {c.id: c for c in chapter.concepts}
    concepts = set(task.required_concepts + task.curveball.required_concepts)
    wrong = [a.id for a in task.allowed_actions if a.id not in (task.correct_action, task.curveball.correct_action)]
    mistake_actions = {}
    for misconception, action in task.misconception_linked_actions.items():
        for cid in concepts:
            if cid in labels and misconception in labels[cid].common_misconceptions:
                mistake_actions.setdefault(cid, action)
    for cid in task.required_concepts:
        if wrong:
            mistake_actions.setdefault(cid, wrong[0])
    hints = {cid: f"Remind Alex: {(labels[cid].key_points or [labels[cid].label])[0]}" for cid in concepts if cid in labels}
    mission = Mission(
        task=task, source=source, variant=variant, curveball_evidence=_curveball_cards(task.curveball.scenario),
        mistake_actions=mistake_actions, hints=hints, objective=task.success_conditions[0] if task.success_conditions else "",
    )
    return _apply_variant(mission, variant) if source == "chapter_pack" else mission


def _curveball_cards(condition: str) -> list[EvidenceCard]:
    return [
        EvidenceCard(id=CURVEBALL_CARD, title="⚠ New condition", detail=condition, source_ref="mission update"),
        EvidenceCard(id="cb_status", title="Schedule note", detail="The review meeting has moved to Thursday.",
                     source_ref="mission update"),
    ]


def _apply_variant(mission: Mission, variant: int) -> Mission:
    if not variant:
        return mission
    rng = random.Random(variant)
    raw = mission.task.model_dump()
    rng.shuffle(raw["evidence_cards"])
    rng.shuffle(raw["allowed_actions"])
    raw["task_id"] = f"{raw['task_id']}_v{variant}"
    raw["title"] = f"{raw['title']} · Variant {variant}"
    raw["scenario"] = f"New case file #{variant}: {raw['scenario']}"
    mission.task = AssessmentTask.model_validate(raw)
    return mission


# ------------------------------------------------------------------ deciding


def _label(task: AssessmentTask, action_id: str) -> str:
    return next((a.label for a in task.allowed_actions if a.id == action_id), action_id)


def assisted_concepts(chapter: Chapter, required: list[str], assist: Assist) -> set[str]:
    helped = {c for c in assist.hint_concepts if c in required}
    for text in assist.pause_texts:
        for cid in required:
            concept = next((c for c in chapter.concepts if c.id == cid), None)
            if concept and _semantic_overlap(" ".join([concept.label, *concept.key_points]), text) >= 0.2:
                helped.add(cid)
    return helped


def decide_mission(chapter: Chapter, brain: AlexBrain, mission: Mission, received: list[str],
                   phase: Literal["initial", "curveball"], assist: Assist | None = None,
                   previous_action: str | None = None) -> MissionDecision:
    """Alex's choice from AlexBrain + received evidence + assistance only."""
    assist = assist or Assist()
    task = mission.task
    required = task.required_concepts if phase == "initial" else task.curveball.required_concepts
    target = task.correct_action if phase == "initial" else task.curveball.correct_action
    if phase == "initial":
        evidence_ok = bool(set(task.relevant_evidence_ids) & set(received))
    else:
        evidence_ok = CURVEBALL_CARD in received
    helped = assisted_concepts(chapter, required, assist)
    labels = {c.id: c.label for c in chapter.concepts}

    def known(cid: str) -> bool:
        k = brain.concepts.get(cid)
        return bool(k and k.level >= 2 and not k.misconceptions)

    misconceived = next((c for c in required if brain.concepts.get(c) and brain.concepts[c].misconceptions
                         and c not in helped), None)
    weak = [c for c in required if not known(c) and c not in helped]

    def wrong_for(cid: str | None) -> str:
        # In the curveball, a missing concept means Alex repeats his earlier plan.
        if phase == "curveball" and previous_action and previous_action != target:
            return previous_action
        action = mission.mistake_actions.get(cid or "")
        if action and action != target:
            return action
        avoid = {target, task.correct_action, "adapt", MORE_EVIDENCE}
        options = [a.id for a in task.allowed_actions if a.id not in avoid]
        return options[0] if options else next(a.id for a in task.allowed_actions if a.id != target)

    culprit = None
    if misconceived:
        action, culprit = wrong_for(misconceived), misconceived
        reason = f"I went with what I believe about {labels.get(misconceived, misconceived)}: " \
                 f"{brain.concepts[misconceived].misconceptions[-1]}"
    elif not evidence_ok:
        culprit = weak[0] if weak else None
        if phase == "curveball":
            action = previous_action if previous_action and previous_action != target else wrong_for(culprit)
            reason = "Nobody told me anything had changed, so I kept my earlier plan."
        else:
            action = MORE_EVIDENCE if any(a.id == MORE_EVIDENCE for a in task.allowed_actions) else wrong_for(culprit)
            reason = "None of the evidence I received connects to what you taught me."
    elif not weak:
        action = target
        reason = ("You helped me connect the evidence to the idea I was missing."
                  if helped and any(not known(c) for c in required)
                  else "The evidence you sent matches what you taught me.")
    else:
        culprit = weak[0]
        action = wrong_for(culprit)
        reason = f"I wasn't taught enough about {labels.get(culprit, culprit)} to justify anything stronger."

    success = action == target
    consequence = (f"It works: {_label(task, action)}" if success
                   else mission.why_wrong.get(action) or "The plan fails and exposes a knowledge gap.")
    return MissionDecision(
        phase=phase, action_id=action, action_label=_label(task, action), success=success,
        assisted=assist.used, explanation=reason, consequence=consequence,
        culprit_concept=None if success else culprit,
    )


# ------------------------------------------------------------------ scoring & report


def play_mission(chapter: Chapter, brain: AlexBrain, mission: Mission, *, received: list[str],
                 curveball_received: list[str], initial_assist: Assist, curveball_assist: Assist,
                 prediction: str | None = None) -> dict[str, Any]:
    """Recompute the whole mission from the player's inputs and score it transparently."""
    initial = decide_mission(chapter, brain, mission, received, "initial", initial_assist)
    curve = decide_mission(chapter, brain, mission, curveball_received, "curveball", curveball_assist,
                           previous_action=initial.action_id)
    task, w = mission.task, mission.weights
    relevant = set(task.relevant_evidence_ids)
    sent = set(received)
    evidence_frac = len(sent & relevant) / max(1, len(relevant)) - 0.25 * len(sent - relevant)
    culprits = {d.culprit_concept for d in (initial, curve) if d.culprit_concept}
    prediction_ok = bool(prediction) and (prediction in culprits or (not culprits and prediction in task.required_concepts))
    evidence_pts = round(w["evidence"] * (0.8 * max(0.0, evidence_frac) + (0.2 if prediction_ok else 0)))

    def decision_pts(d: MissionDecision, weight: int) -> int:
        return weight if d.success and not d.assisted else weight // 2 if d.success else 0

    components = {
        "evidence": evidence_pts,
        "decision": decision_pts(initial, w["decision"]),
        "curveball": decision_pts(curve, w["curveball"]),
    }
    total = sum(components.values())
    labels = {c.id: c.label for c in chapter.concepts}
    tested = list(dict.fromkeys(task.required_concepts + task.curveball.required_concepts))
    demonstrated = [c for c in tested if brain.concepts.get(c) and brain.concepts[c].level >= 2
                    and not brain.concepts[c].misconceptions]
    return {
        "decisions": [initial.model_dump(), curve.model_dump()],
        "components": components,
        "weights": w,
        "score": total,
        "pass_mark": mission.pass_mark,
        "passed": total >= mission.pass_mark,
        "independent_successes": sum(d.success and not d.assisted for d in (initial, curve)),
        "assisted_successes": sum(d.success and d.assisted for d in (initial, curve)),
        "prediction_correct": prediction_ok,
        "concepts_demonstrated": demonstrated,
        "concepts_missing": [c for c in tested if c not in demonstrated],
        "misconceptions": {c: brain.concepts[c].misconceptions for c in tested
                           if brain.concepts.get(c) and brain.concepts[c].misconceptions},
        "teaching_evidence": {c: brain.concepts[c].supporting_evidence[-2:] for c in tested if brain.concepts.get(c)},
        "culprit_concepts": sorted(culprits),
        # Revealed only after the mission (relevance stays hidden during play).
        "evidence_review": {
            "relevant_sent": [c.title for c in task.evidence_cards if c.id in sent & relevant],
            "irrelevant_sent": [c.title for c in task.evidence_cards if c.id in sent - relevant],
            "relevant_missed": [c.title for c in task.evidence_cards if c.id in relevant - sent],
            "curveball_seen": CURVEBALL_CARD in curveball_received,
        },
        "labels": {c: labels.get(c, c) for c in tested},
        "reference": task.answer_explanation,
        "curveball_reference": task.curveball.expected_reasoning,
    }


def client_mission(mission: Mission, chapter: Chapter) -> dict:
    """What the browser may see: no correct answers, relevance flags or mistake mapping."""
    task = mission.task
    return {
        "title": task.title,
        "scenario": task.scenario,
        "objective": mission.objective,
        "source": mission.source,
        "variant": mission.variant,
        "pass_mark": mission.pass_mark,
        "weights": mission.weights,
        "evidence": [c.model_dump() for c in task.evidence_cards],
        "actions": [a.model_dump() for a in task.allowed_actions],
        "curveball": {"condition": task.curveball.scenario,
                      "evidence": [c.model_dump() for c in mission.curveball_evidence]},
        "concepts": [{"id": c.id, "label": c.label} for c in chapter.concepts],
        "hints": mission.hints,
    }


def save_mission_debug(mission: Mission) -> str:
    return json.dumps(mission.model_dump(), indent=2)
