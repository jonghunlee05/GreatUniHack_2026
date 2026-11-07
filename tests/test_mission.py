"""Interactive Assessment Room mission engine. Offline; no API calls."""

import json
from pathlib import Path

import pytest

from purple import mission as mission_mod, web_bridge
from purple.alex_agent import process_teaching_turn
from purple.alex_brain import AlexState
from purple.alex_engine import AlexBrain
from purple.contracts import Chapter
from purple.mission import CURVEBALL_CARD, MORE_EVIDENCE, Assist, build_mission, client_mission, decide_mission, play_mission

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(autouse=True)
def isolated(monkeypatch, tmp_path):
    monkeypatch.setenv("ALEX_OFFLINE", "1")
    monkeypatch.setenv("ALEX_IGNORE_ENV_FILE", "1")
    monkeypatch.setattr(mission_mod, "MISSION_DIR", tmp_path / "missions")


def load(name):
    return json.loads((ROOT / "examples" / name).read_text())


@pytest.fixture
def bio():
    return Chapter.model_validate(load("biology_chapter.json"))


@pytest.fixture
def pack():
    return load("biology_pack.json")


@pytest.fixture
def pcb():
    return Chapter.model_validate(load("pcb_chapter.json"))


def brain_for(chapter, levels=None, misconceptions=None):
    brain = AlexBrain.for_chapter(chapter)
    for cid, level in (levels or {}).items():
        brain.concepts[cid].level = level
        brain.concepts[cid].supporting_evidence = [f"taught {cid}"]
    for cid, text in (misconceptions or {}).items():
        brain.concepts[cid].misconceptions = [text]
    return brain


def all_taught(chapter):
    return brain_for(chapter, {c.id: 3 for c in chapter.concepts})


def play(chapter, brain, m, *, received=None, curve=(CURVEBALL_CARD,), hints=(), curve_hints=(), prediction=None):
    return play_mission(
        chapter, brain, m, received=list(received if received is not None else m.task.relevant_evidence_ids),
        curveball_received=list(curve), initial_assist=Assist(hint_concepts=list(hints)),
        curveball_assist=Assist(hint_concepts=list(curve_hints)), prediction=prediction)


# ---------------------------------------------------------------- building


def test_pack_mission_is_validated_and_mapped(bio, pack):
    m = build_mission(bio, pack)
    assert m.source == "chapter_pack"
    assert 3 <= len(m.task.evidence_cards) <= 5
    assert m.task.required_concepts == ["organ_tissue_types", "tissue_composition"]  # c1, c3
    assert set(m.task.curveball.required_concepts) == {"organ_tissue_types", "tissue_categories"}  # c1, c2
    assert m.mistake_actions["tissue_composition"] == "m1"
    assert m.pass_mark == 70 and sum(m.weights.values()) == 100


def test_mission_is_cached_and_not_regenerated(bio, pack, monkeypatch):
    first = build_mission(bio, pack, game_id="g1")
    calls = []
    monkeypatch.setattr(mission_mod, "_from_pack", lambda *a, **k: calls.append(1))
    again = build_mission(bio, pack, game_id="g1")
    assert calls == [] and again == first


def test_malformed_pack_falls_back_to_labelled_demo(bio):
    m = build_mission(bio, {"assessment": {"briefing": {}}})
    assert m.source == "demo"
    assert m.task.evidence_cards


def test_client_view_hides_answers(bio, pack):
    view = json.dumps(client_mission(build_mission(bio, pack), bio))
    for secret in ("relevant_evidence_ids", "correct_action", "mistake_actions", "why_wrong", "answer_explanation"):
        assert secret not in view


def test_variants_differ_but_stay_valid(bio, pack):
    v0, v1 = build_mission(bio, pack), build_mission(bio, pack, variant=1)
    assert v1.task.task_id != v0.task.task_id and "Variant 1" in v1.task.title
    assert {c.id for c in v1.task.evidence_cards} == {c.id for c in v0.task.evidence_cards}
    assert v1.task.correct_action == v0.task.correct_action


# ---------------------------------------------------------------- decisions


def test_different_brains_make_different_decisions(bio, pack):
    m = build_mission(bio, pack)
    empty = decide_mission(bio, brain_for(bio), m, m.task.relevant_evidence_ids, "initial")
    taught = decide_mission(bio, all_taught(bio), m, m.task.relevant_evidence_ids, "initial")
    confused = decide_mission(bio, brain_for(bio, {c.id: 3 for c in bio.concepts},
                                             {"tissue_composition": "If the cells are alive the tissue is fine"}),
                              m, m.task.relevant_evidence_ids, "initial")
    assert taught.success and taught.action_id == "decide"
    assert not empty.success
    assert confused.action_id == "m1"  # the pack's linked mistake for the misunderstood concept
    assert confused.culprit_concept == "tissue_composition"


def test_alex_only_uses_evidence_he_received(bio, pack):
    m = build_mission(bio, pack)
    irrelevant = [c.id for c in m.task.evidence_cards if c.id not in m.task.relevant_evidence_ids]
    starved = decide_mission(bio, all_taught(bio), m, irrelevant, "initial")
    assert starved.action_id == MORE_EVIDENCE and not starved.success


def test_hints_count_as_assisted_and_score_half(bio, pack):
    m = build_mission(bio, pack)
    weak = brain_for(bio, {"organ_tissue_types": 3})  # tissue_composition not taught
    alone = play(bio, weak, m)
    helped = play(bio, weak, m, hints=["tissue_composition"])
    assert not alone["decisions"][0]["success"]
    assert helped["decisions"][0]["success"] and helped["decisions"][0]["assisted"]
    independent = play(bio, all_taught(bio), m)
    assert independent["components"]["decision"] == m.weights["decision"]
    assert helped["components"]["decision"] == m.weights["decision"] // 2
    assert helped["assisted_successes"] >= 1 and independent["independent_successes"] == 2


def test_pause_and_explain_is_assisted(bio, pack):
    m = build_mission(bio, pack)
    weak = brain_for(bio, {"organ_tissue_types": 3})
    d = decide_mission(bio, weak, m, m.task.relevant_evidence_ids, "initial",
                       Assist(pause_texts=["Tissue is cells plus extracellular matrix plus signalling molecules"]))
    assert d.success and d.assisted


def test_curveball_tests_transfer(bio, pack):
    m = build_mission(bio, pack)
    assert m.task.curveball.correct_action != m.task.correct_action
    assert set(m.task.curveball.required_concepts) != set(m.task.required_concepts)
    # Knows the first concepts but not the new one: passes stage 2, then repeats the old plan.
    partial = brain_for(bio, {"organ_tissue_types": 3, "tissue_composition": 3})
    r = play(bio, partial, m)
    assert r["decisions"][0]["success"] and not r["decisions"][1]["success"]
    assert r["decisions"][1]["action_id"] == r["decisions"][0]["action_id"]
    # Not showing Alex the new condition also makes him keep the old plan.
    blind = play(bio, all_taught(bio), m, curve=())
    assert not blind["decisions"][1]["success"]


# ---------------------------------------------------------------- report & loop


def test_scoring_is_transparent_and_pass_uses_pack_mark(bio, pack):
    m = build_mission(bio, pack)
    r = play(bio, all_taught(bio), m)
    assert r["score"] == sum(r["components"].values())
    assert r["passed"] and r["pass_mark"] == 70
    failed = play(bio, brain_for(bio), m)
    assert not failed["passed"] and failed["concepts_missing"]


def test_prediction_and_detective_culprit(bio, pack):
    m = build_mission(bio, pack)
    weak = brain_for(bio, {"organ_tissue_types": 3, "tissue_categories": 3})  # only composition missing
    right = play(bio, weak, m, prediction="tissue_composition")
    wrong = play(bio, weak, m, prediction="tissue_categories")
    assert "tissue_composition" in right["culprit_concepts"]
    assert right["prediction_correct"] and not wrong["prediction_correct"]
    assert right["components"]["evidence"] > wrong["components"]["evidence"]


def test_reteaching_changes_alex_performance(bio, pack):
    m = build_mission(bio, pack)
    state = AlexState.for_chapter(bio)
    before = play(bio, state.brain, m)
    assert not before["passed"]
    lessons = [
        "Organs are built from several different tissue types working together, for example the knee joint.",
        "There are four tissue categories: epithelial, connective, muscle and nervous, for example cartilage is connective.",
        "Tissue is made of cells, extracellular matrix and signalling molecules, for example cartilage matrix.",
    ]
    brain = state.model_dump()
    for _ in range(2):
        for text in lessons:
            brain = process_teaching_turn("g", bio, brain, text)["updated_brain"]
    after = play(bio, AlexState.model_validate(brain).brain, m)
    assert after["score"] > before["score"]
    assert after["decisions"][0]["success"]


def test_same_engine_works_for_engineering(pcb):
    m = build_mission(pcb)
    assert m.source == "authored"
    taught = play(pcb, all_taught(pcb), m)
    assert taught["passed"]
    confused = brain_for(pcb, {c.id: 3 for c in pcb.concepts},
                         {"solder_fatigue": "If a circuit works while stationary, solder joints cannot be the problem"})
    d = decide_mission(pcb, confused, m, m.task.relevant_evidence_ids, "initial")
    assert d.action_id == "replace_firmware"


# ---------------------------------------------------------------- web bridge


WEB_CHAPTER = {
    "week": 1, "title": "Tissues", "summary": "Organs combine tissues; tissue is cells, matrix and signals.",
    "era": {"name": "Lab", "years": "2020s", "problem": "Implants fail."},
    "ilos": [{"id": "W1.1", "statement": "Explain tissue composition", "bloomLevel": "understand",
              "keyConcepts": ["Tissue types in organs", "Tissue categories", "Cells matrix and signals"]}],
    "sourceRefs": [],
}


def bridge(command, **extra):
    return web_bridge.handle({"command": command, "game": {"id": "g", "course": {"subject": "Biology"}},
                              "chapter": WEB_CHAPTER, "pack": load("biology_pack.json"), **extra})


def test_bridge_full_mission_loop_with_web_ids():
    view = bridge("mission_load")["mission"]
    assert view["source"] == "chapter_pack"
    assert all("-" in c["id"] or c["id"].isalpha() for c in view["concepts"])  # web slugs
    received = [c["id"] for c in view["evidence"]][:2]
    decision = bridge("mission_decide", phase="initial", received=received)["decision"]
    assert decision["action_id"] in {a["id"] for a in view["actions"]}
    finish = bridge("mission_finish", received=received, curveballReceived=[CURVEBALL_CARD],
                    prediction=view["concepts"][0]["id"])
    report = finish["report"]
    assert report["score"] == sum(report["components"].values())
    assert not report["passed"]  # untaught Alex
    assert report["feedback"]["failedConcepts"]
    assert all(c in {x["id"] for x in view["concepts"]} for c in report["feedback"]["failedConcepts"])


def test_bridge_decisions_are_deterministic():
    received = ["e1", "e2"]
    a = bridge("mission_decide", phase="initial", received=received)
    b = bridge("mission_decide", phase="initial", received=received)
    assert a == b
