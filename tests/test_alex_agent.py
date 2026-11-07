"""Multi-turn tests for Agent 3 (Alex). No test calls the real API."""

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from purple.alex_agent import (
    AlexConfigError,
    ClaudeEvaluator,
    OfflineEvaluator,
    process_teaching_turn,
)
from purple.alex_brain import AlexState, BrainStore
from purple.alex_schemas import AlexModelOutput, ConceptEvaluation, TeachingInput
from purple.contracts import Chapter

ROOT = Path(__file__).resolve().parents[1]

PCB_PARTIAL = "Board flex puts mechanical stress on solder joints."
PCB_FULL = (
    "Repeated board flex concentrates mechanical stress at solder joints, and microcracks "
    "create intermittent electrical continuity during movement."
)
PCB_FULL_EXAMPLE = PCB_FULL + " For example, moving the cable flexes the board so the signal drops."
PCB_APPLY = "If the device vibrates in a car, the flex causes the crack to open and the result is resets."
PCB_TRANSFER = "If the board were stiffened, then the flex is reduced so cracks open less, which leads to fewer drops."
PCB_MISCONCEPTION = "If a circuit works while stationary, solder joints cannot be the problem."
VAGUE = "It is about boards and stuff."


@pytest.fixture(autouse=True)
def offline_by_default(monkeypatch):
    # apps/web/.env.local may hold a real key; tests must never use it.
    monkeypatch.setenv("ALEX_OFFLINE", "1")


def load(name):
    return Chapter.model_validate(json.loads((ROOT / "examples" / name).read_text()))


@pytest.fixture
def pcb():
    return load("pcb_chapter.json")


@pytest.fixture
def econ():
    return load("economics_chapter.json")


class Session:
    """Drives a multi-turn conversation like the Teaching Room does."""

    def __init__(self, chapter, evaluator=None):
        self.chapter = chapter
        self.brain = None
        self.history = []
        self.results = []
        self.evaluator = evaluator

    def teach(self, message, **kwargs):
        kwargs.setdefault("evaluator", self.evaluator)
        result = process_teaching_turn("game", self.chapter, self.brain, message, self.history, **kwargs)
        self.brain = result["updated_brain"]
        text = message.text if isinstance(message, TeachingInput) else message
        self.history += [{"role": "user", "content": text},
                         {"role": "assistant", "content": result["alex_reply"]}]
        self.results.append(result)
        return result

    def level(self, concept_id):
        return self.brain["brain"]["concepts"][concept_id]["level"]

    def knowledge(self, concept_id):
        return self.brain["brain"]["concepts"][concept_id]


class ScriptedEvaluator:
    """Returns pre-baked model outputs; counts calls."""

    mode = "claude"

    def __init__(self, *outputs):
        self.outputs = list(outputs)
        self.calls = 0

    def evaluate(self, ctx):
        self.calls += 1
        return self.outputs.pop(0) if len(self.outputs) > 1 else self.outputs[0]


def model_output(concept_id, quality, strategy, *, level=2, evidence=(), misconceptions=(),
                 reply="Could you give me an example?"):
    return AlexModelOutput(
        explanation_quality=quality, target_concept_id=concept_id, response_strategy=strategy,
        updated_concept_evaluations=[ConceptEvaluation(
            concept_id=concept_id, mastery_level=level, supporting_evidence=list(evidence),
            missing_explanations=[], misconceptions=list(misconceptions),
            resolved_misconceptions=[], confidence=0.8,
        )],
        alex_reply=reply, next_question=reply, image_observations="",
        teaching_progress_summary="Learning solder fatigue.",
    )


# 1
def test_incomplete_explanation_triggers_clarify(pcb):
    s = Session(pcb)
    result = s.teach(PCB_PARTIAL)
    assert result["strategy"] == "CLARIFY"
    assert result["target_concept_id"] == "solder_fatigue"
    assert s.level("solder_fatigue") < 2
    assert s.knowledge("solder_fatigue")["missing_points"]


# 2
def test_misconception_triggers_challenge_and_is_recorded(pcb):
    s = Session(pcb)
    result = s.teach(PCB_MISCONCEPTION)
    assert result["strategy"] == "CHALLENGE"
    assert result["misconceptions"]
    assert s.knowledge("solder_fatigue")["misconceptions"]
    assert result["readiness"] == "needs_review"
    # Alex questions the claim rather than stating the answer.
    assert result["alex_reply"].strip().endswith("?")


# 3
def test_strong_explanation_leads_to_apply_then_transfer(pcb):
    s = Session(pcb)
    assert s.teach(PCB_FULL_EXAMPLE)["strategy"] == "APPLY"
    assert s.teach(PCB_APPLY)["strategy"] == "TRANSFER"
    assert s.level("solder_fatigue") == 3


def test_definition_without_example_asks_for_example(pcb):
    s = Session(pcb)
    assert s.teach(PCB_FULL)["strategy"] == "EXAMPLE"
    assert s.level("solder_fatigue") == 2


# 4
def test_repeated_difficulty_triggers_scaffold(pcb):
    s = Session(pcb)
    strategies = [s.teach(msg)["strategy"] for msg in
                  [VAGUE, "Boards can have problems sometimes.", "Something with the board breaks."]]
    assert strategies[:2] == ["CLARIFY", "CLARIFY"]
    assert strategies[2] == "SCAFFOLD"


# 5
def test_alex_does_not_repeat_the_same_question(pcb):
    s = Session(pcb)
    questions = [s.teach(msg)["next_question"] for msg in [PCB_PARTIAL, PCB_PARTIAL + " Really."]]
    assert questions[0] != questions[1]


def test_model_reply_that_repeats_a_question_is_replaced(pcb):
    reply = "What happens to the solder when the board moves?"
    evaluator = ScriptedEvaluator(model_output("solder_fatigue", "partial", "CLARIFY", level=1,
                                               evidence=[PCB_PARTIAL], reply=reply))
    s = Session(pcb, evaluator)
    first = s.teach(PCB_PARTIAL)
    second = s.teach(PCB_PARTIAL + " Again.")
    assert first["alex_reply"] == reply
    assert second["alex_reply"] != reply


# 6
def test_brain_updates_are_evidence_based(pcb):
    s = Session(pcb)
    s.teach(PCB_FULL)
    evidence = s.knowledge("solder_fatigue")["supporting_evidence"]
    assert evidence == [PCB_FULL]
    # Off-topic chatter adds no evidence and no mastery.
    before = s.knowledge("strain_relief")
    s.teach("I like pizza on Fridays.")
    assert s.knowledge("strain_relief")["level"] == before["level"]
    assert s.knowledge("strain_relief")["supporting_evidence"] == before["supporting_evidence"]


def test_invented_evidence_from_model_is_rejected(pcb):
    fabricated = model_output("solder_fatigue", "applied", "APPLY", level=3,
                              evidence=["Microcracks cause intermittent continuity."])
    s = Session(pcb, ScriptedEvaluator(fabricated))
    s.teach("Solder is shiny.")
    assert s.level("solder_fatigue") == 0
    assert s.knowledge("solder_fatigue")["supporting_evidence"] == []


def test_mastery_rises_gradually_even_if_model_overclaims(pcb):
    overclaim = model_output("solder_fatigue", "applied", "APPLY", level=3, evidence=[PCB_FULL])
    s = Session(pcb, ScriptedEvaluator(overclaim))
    s.teach(PCB_FULL)
    assert s.level("solder_fatigue") == 2  # 3 needs earlier evidence plus application


# 7
def test_incorrect_explanation_never_grants_full_mastery(pcb):
    wrong = model_output("solder_fatigue", "incorrect", "CHALLENGE", level=3, evidence=[PCB_MISCONCEPTION],
                         misconceptions=["Stationary circuits can't have solder faults"])
    s = Session(pcb, ScriptedEvaluator(wrong))
    s.teach(PCB_MISCONCEPTION)
    assert s.level("solder_fatigue") <= 1


def test_misconception_after_good_teaching_caps_mastery(pcb):
    s = Session(pcb)
    s.teach(PCB_FULL_EXAMPLE)
    assert s.level("solder_fatigue") == 2
    s.teach(PCB_MISCONCEPTION)
    assert s.level("solder_fatigue") == 1
    assert s.results[-1]["strategy"] == "CHALLENGE"


# 8
def test_chapters_keep_separate_knowledge_states(pcb, econ):
    storage = {}
    store = BrainStore(storage)
    result = process_teaching_turn("g", pcb, store.load(pcb), PCB_FULL)
    store.save(AlexState.model_validate(result["updated_brain"]))

    econ_state = store.load(econ)
    assert econ_state.chapter_id == econ.chapter_id
    assert all(k.level == 0 for k in econ_state.brain.concepts.values())

    restored = store.load(pcb)
    assert restored.brain.concepts["solder_fatigue"].level == 2
    assert restored.turn == 1


def test_state_from_another_chapter_is_refused(pcb, econ):
    pcb_state = AlexState.for_chapter(pcb)
    with pytest.raises(ValueError):
        process_teaching_turn("g", econ, pcb_state, "Price ceilings cause shortages.")


# 9
def test_assessment_failure_shapes_the_next_interaction(pcb):
    s = Session(pcb)
    s.teach(PCB_FULL_EXAMPLE)
    feedback = {
        "chapter_id": pcb.chapter_id,
        "failed_concepts": ["strain_relief"],
        "alex_mistake": "I assumed moving the cable could never affect the joints.",
        "recommended_revision": "Explain how strain relief protects solder joints.",
    }
    level_before = s.level("strain_relief")
    result = s.teach("Hi again!", assessment_feedback=feedback)
    assert result["strategy"] == "CLARIFY"
    assert result["target_concept_id"] == "strain_relief"
    assert "assessment" in result["alex_reply"].lower()
    assert "cable could never affect" in result["alex_reply"]
    assert s.level("strain_relief") == level_before  # no mastery without new teaching
    assert result["readiness"] == "needs_review"

    s.teach("Strain relief redirects cable forces away from solder joints, for example a clamp on the cable.")
    assert s.level("strain_relief") >= 2
    assert s.brain["pending_feedback"] is None
    assert s.brain["feedback_history"]  # remembered for later


def test_feedback_for_unknown_concept_id_maps_to_closest_concept(pcb):
    s = Session(pcb)
    result = s.teach("Hello", assessment_feedback={
        "chapter_id": pcb.chapter_id, "failed_concepts": ["cable_strain_relief_clamps"],
        "alex_mistake": "I forgot about cables.", "recommended_revision": "Explain strain relief.",
    })
    assert result["target_concept_id"] == "strain_relief"


# 10
def test_reruns_do_not_duplicate_ai_calls(pcb):
    evaluator = ScriptedEvaluator(model_output("solder_fatigue", "definition_only", "EXAMPLE",
                                               evidence=[PCB_FULL]))
    first = process_teaching_turn("g", pcb, None, PCB_FULL, [], turn_id="t-1", evaluator=evaluator)
    state = first["updated_brain"]
    again = process_teaching_turn("g", pcb, state, PCB_FULL, [], turn_id="t-1", evaluator=evaluator)
    assert evaluator.calls == 1
    assert again["mode"] == "cached"
    assert again["alex_reply"] == first["alex_reply"]
    assert again["updated_brain"]["turn"] == 1


def test_returned_turn_id_can_be_replayed_safely(pcb):
    evaluator = ScriptedEvaluator(model_output("solder_fatigue", "partial", "CLARIFY", level=1,
                                               evidence=[PCB_PARTIAL]))
    state = AlexState.for_chapter(pcb).model_dump()
    first = process_teaching_turn("g", pcb, state, PCB_PARTIAL, evaluator=evaluator)
    # A double-submit that re-sends the auto-generated ID with the saved state is a no-op.
    process_teaching_turn("g", pcb, first["updated_brain"], PCB_PARTIAL, evaluator=evaluator,
                          turn_id=first["turn_id"])
    assert evaluator.calls == 1


# 11
def test_works_for_economics_too(econ):
    s = Session(econ)
    assert s.teach("A price ceiling is about prices.")["strategy"] in {"CLARIFY", "SCAFFOLD"}
    r = s.teach("A lower legal price always makes the product available to more people.")
    assert r["strategy"] == "CHALLENGE"
    r = s.teach(
        "A ceiling below equilibrium is binding: quantity demanded exceeds quantity supplied, "
        "which creates a shortage. For example, rent control leads to long waiting lists."
    )
    assert r["strategy"] == "APPLY"
    assert s.knowledge("binding_ceiling")["misconceptions"] == []  # corrected by new teaching
    assert s.level("binding_ceiling") >= 1


def test_full_chapter_reaches_readiness_without_unlocking(pcb):
    s = Session(pcb)
    for msg in [PCB_FULL, PCB_FULL_EXAMPLE, PCB_APPLY, PCB_TRANSFER,
                "Strain relief redirects cable forces away from solder joints, for example a cable clamp.",
                "If someone yanks the cable, the clamp takes the force so the joints are protected.",
                "If the clamp were loose, then the force reaches the joints again, which leads to cracks."]:
        s.teach(msg)
    strategies = [r["strategy"] for r in s.results]
    assert "PROGRESS" in strategies and "SUMMARISE" in strategies
    assert s.results[-1]["readiness"] == "ready_for_assessment"
    final = s.teach("Yes, that's right!")
    assert final["strategy"] == "PROGRESS"
    assert "assessment" in final["alex_reply"].lower()
    # Agent 3 only reports readiness; it returns no scores or unlocks.
    assert not {"score", "unlocked", "passed"} & set(final)


# 12
def test_missing_credentials_give_labelled_offline_demo(pcb, monkeypatch):
    monkeypatch.delenv("ALEX_OFFLINE", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("ALEX_IGNORE_ENV_FILE", "1")
    result = process_teaching_turn("g", pcb, None, PCB_PARTIAL)
    assert result["mode"] == "offline-demo"
    assert any("Offline demonstration" in w for w in result["warnings"])
    with pytest.raises(AlexConfigError, match="ANTHROPIC_API_KEY"):
        process_teaching_turn("g", pcb, None, PCB_PARTIAL, require_live=True)


# ------------------------------------------------- Claude evaluator (fake client)


class FakeMessages:
    def __init__(self, response):
        self.response = response
        self.requests = []

    def parse(self, **kwargs):
        self.requests.append(kwargs)
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def fake_client(parsed, stop_reason="end_turn"):
    messages = FakeMessages(SimpleNamespace(parsed_output=parsed, stop_reason=stop_reason))
    return SimpleNamespace(beta=SimpleNamespace(messages=messages)), messages


def test_claude_request_is_structured_cached_and_chapter_scoped(pcb):
    parsed = model_output("solder_fatigue", "definition_only", "EXAMPLE", evidence=[PCB_FULL],
                          reply="Ooh! Can you give me a real example of that?")
    client, messages = fake_client(parsed)
    s = Session(pcb, ClaudeEvaluator(client=client, model="claude-opus-5-5", effort="low"))
    result = s.teach(PCB_FULL)
    request = messages.requests[0]
    assert request["output_format"] is AlexModelOutput
    assert request["output_config"] == {"effort": "low"}
    assert request["system"][1]["cache_control"] == {"type": "ephemeral"}
    assert pcb.title in request["system"][1]["text"]
    assert len(request["messages"]) == 1  # recent window + state in one compact user turn
    assert result["mode"] == "claude"
    assert result["alex_reply"] == "Ooh! Can you give me a real example of that?"


def test_policy_overrides_a_model_strategy_that_breaks_the_rules(pcb):
    parsed = model_output("solder_fatigue", "partial", "TRANSFER", level=1, evidence=[PCB_PARTIAL],
                          reply="What if the board were made of rubber?")
    client, _ = fake_client(parsed)
    result = Session(pcb, ClaudeEvaluator(client=client)).teach(PCB_PARTIAL)
    assert result["strategy"] == "CLARIFY"
    assert result["alex_reply"] != "What if the board were made of rubber?"


def test_image_is_sent_but_not_proof_of_understanding(pcb):
    parsed = model_output("solder_fatigue", "applied", "APPLY", level=3,
                          evidence=["diagram of cracked solder joint"])
    client, messages = fake_client(parsed)
    s = Session(pcb, ClaudeEvaluator(client=client))
    result = s.teach(TeachingInput(text="", modality="image", image_bytes=b"\x89PNG fake",
                                   image_media_type="image/png"))
    content = messages.requests[0]["messages"][0]["content"]
    assert content[0]["type"] == "image"
    assert s.level("solder_fatigue") == 0
    assert result["supporting_evidence"] == []


@pytest.mark.parametrize("parsed,stop", [(None, "end_turn"), ("refusal", "refusal")])
def test_bad_model_output_never_corrupts_the_brain(pcb, parsed, stop):
    good = Session(pcb)
    good.teach(PCB_FULL)
    saved = good.brain
    client, _ = fake_client(None if parsed is None else model_output("x", "applied", "APPLY"), stop)
    result = process_teaching_turn("g", pcb, saved, PCB_PARTIAL, [],
                                   evaluator=ClaudeEvaluator(client=client))
    assert result["mode"] == "offline-fallback"
    assert result["warnings"]
    assert result["updated_brain"]["brain"]["concepts"]["solder_fatigue"]["level"] >= 2


def test_network_errors_fall_back_to_offline(pcb):
    messages = FakeMessages(ConnectionError("down"))
    client = SimpleNamespace(beta=SimpleNamespace(messages=messages))
    result = process_teaching_turn("g", pcb, None, PCB_PARTIAL, evaluator=ClaudeEvaluator(client=client))
    assert result["mode"] == "offline-fallback"
    assert result["strategy"] == "CLARIFY"


def test_accepts_web_generator_chapter_shape():
    generated = {
        "week": 2, "title": "HTTP Basics", "summary": "Clients send requests; servers send responses.",
        "ilos": [{"id": "W2.1", "statement": "Explain the request-response cycle",
                  "bloomLevel": "understand", "keyConcepts": ["Client-server model"]}],
        "sourceRefs": [{"file": "lecture2.pdf", "location": "p3"}],
    }
    result = process_teaching_turn("g", generated, None, "The client sends a request to the server.")
    assert result["target_concept_id"] == "client_server_model"
    assert result["updated_brain"]["chapter_id"] == "week_2"


def test_offline_evaluator_is_used_without_scripting(pcb):
    assert OfflineEvaluator().mode == "offline-demo"
