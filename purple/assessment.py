"""Streamlit Mission Control assessment room."""

from __future__ import annotations

from .alex_engine import AlexBrain
from .contracts import AssessmentTask, Attempt, TrialEvent
from .decision_engine import decide
from .scoring import complete_attempt
from .state import key


def render_assessment_room(
    chapter, alex_brain: AlexBrain, task: AssessmentTask, attempt: Attempt
) -> Attempt:
    import streamlit as st

    st.markdown("## 🛰️ Mission Control")
    st.subheader(task.title)
    st.write(task.scenario)
    phase = st.session_state[key("assessment_phase")]

    if phase == "evidence":
        st.markdown("### Phase A · Evidence Hunt")
        selected: list[str] = []
        for card in task.evidence_cards:
            with st.expander(f"🔎 {card.title}"):
                st.write(card.detail)
                st.caption(f"Source: {card.source_ref}")
                if card.id not in attempt.inspected_evidence:
                    attempt.inspected_evidence.append(card.id)
            if st.checkbox("Send to Alex", key=f"purple_evidence_{task.task_id}_{card.id}"):
                selected.append(card.id)
        if st.button("Transmit evidence", type="primary", key=f"purple_transmit_{task.task_id}"):
            attempt.transmitted_evidence = selected
            attempt.events.append(TrialEvent(kind="evidence", detail=f"Sent: {selected}", phase="evidence"))
            st.session_state[key("assessment_phase")] = "decision"
            _save(attempt)
            st.rerun()

    elif phase == "decision":
        st.markdown("### Phase B · Alex's Decision")
        _mentor_controls(attempt, "initial")
        existing = next((d for d in attempt.decisions if d.phase == "initial"), None)
        if existing is None and st.button("Let Alex decide", type="primary", key=f"purple_decide_{task.task_id}"):
            assisted = attempt.pause_teachings > 0 or attempt.hints_used > 0
            attempt.decisions.append(
                decide(alex_brain, task, attempt.transmitted_evidence, assisted=assisted)
            )
            _save(attempt)
            st.rerun()
        if existing:
            _show_decision(existing)
            if st.button("Continue to curveball", key=f"purple_to_curve_{task.task_id}"):
                st.session_state[key("assessment_phase")] = "curveball"
                st.rerun()

    elif phase == "curveball":
        st.markdown("### Phase C · Curveball")
        st.warning(task.curveball.scenario)
        action_labels = {a.id: a.label for a in task.allowed_actions}
        st.selectbox(
            "Predict Alex's response (no score penalty)",
            options=list(action_labels),
            format_func=action_labels.get,
            key=f"purple_prediction_{task.task_id}",
        )
        _mentor_controls(attempt, "curveball")
        existing = next((d for d in attempt.decisions if d.phase == "curveball"), None)
        if existing is None and st.button("Run changed mission", type="primary", key=f"purple_curve_decide_{task.task_id}"):
            assisted = attempt.pause_teachings > 0 or attempt.hints_used > 0
            attempt.decisions.append(
                decide(alex_brain, task, attempt.transmitted_evidence, phase="curveball", assisted=assisted)
            )
            _save(attempt)
            st.rerun()
        if existing:
            _show_decision(existing)
            labels = {c.id: c.label for c in chapter.concepts}
            diagnosis = st.selectbox(
                "Knowledge detective: which concept best explains Alex's result?",
                options=list(labels), format_func=labels.get, key=f"purple_diagnosis_{task.task_id}",
            )
            if st.button("Complete assessment", type="primary", key=f"purple_complete_{task.task_id}"):
                attempt.diagnosis_concept_id = diagnosis
                complete_attempt(alex_brain, task, attempt)
                _save(attempt)
                st.session_state[key("room")] = "report"
                st.rerun()
    return attempt


def _mentor_controls(attempt: Attempt, phase: str) -> None:
    import streamlit as st

    cols = st.columns(2)
    if cols[0].button("Ask why", key=f"purple_why_{attempt.task_id}_{phase}"):
        st.info("Alex: I can only use the ideas you taught me and the evidence you transmitted.")
    if cols[1].button(
        f"Hint ({attempt.hints_used}/1)",
        disabled=attempt.hints_used >= 1,
        key=f"purple_hint_{attempt.task_id}_{phase}",
    ):
        attempt.hints_used += 1
        attempt.events.append(TrialEvent(kind="hint", detail="Conceptual hint used", phase=phase, assisted=True))
        _save(attempt)
        st.rerun()
    with st.expander("Pause & explain"):
        extra = st.text_input("Give Alex one short intervention", key=f"purple_pause_text_{attempt.task_id}_{phase}")
        if st.button("Send intervention", disabled=not extra, key=f"purple_pause_{attempt.task_id}_{phase}"):
            attempt.pause_teachings += 1
            attempt.events.append(TrialEvent(kind="pause", detail=extra, phase=phase, assisted=True))
            _save(attempt)
            st.rerun()


def _show_decision(result) -> None:
    import streamlit as st

    (st.success if result.success else st.error)(result.consequence)
    st.write(f"**Alex's reasoning:** {result.explanation}")
    st.caption("Assisted run" if result.assisted else "Independent run")


def _save(attempt: Attempt) -> None:
    import streamlit as st

    st.session_state[key("attempt")] = attempt.model_dump()
