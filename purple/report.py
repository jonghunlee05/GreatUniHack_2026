"""Interactive knowledge-gap report, replay, repair, and rematch UI."""

from __future__ import annotations

from .alex_engine import AlexBrain
from .contracts import AssessmentTask, Attempt, Chapter
from .state import key, start_rematch, start_repair


def render_report_room(
    chapter: Chapter, alex_brain: AlexBrain, task: AssessmentTask, attempt: Attempt
) -> None:
    import streamlit as st

    if not attempt.completed or attempt.score is None:
        st.error("Complete both assessment phases before opening this report.")
        return
    st.markdown("## 🕵️ Knowledge Gap Report")
    stars = 3 if attempt.score >= 85 else 2 if attempt.score >= 65 else 1 if attempt.score >= 40 else 0
    c1, c2 = st.columns([1, 2])
    c1.metric("Final score", f"{attempt.score}/100")
    c2.markdown(f"### {'⭐' * stars}{'☆' * (3 - stars)}")
    st.caption("Alex is a simulated learning character; this result is feedback, not scientific proof of human learning.")

    st.markdown("### Transparent scoring")
    labels = {
        "teaching_accuracy": ("Teaching accuracy & reasoning", 30),
        "independent_performance": ("Alex independent performance", 30),
        "knowledge_transfer": ("Knowledge transfer", 15),
        "evidence_selection": ("Evidence selection", 10),
        "diagnosis": ("Player diagnosis", 15),
    }
    for component, points in attempt.score_components.items():
        label, maximum = labels[component]
        st.progress(points / maximum if maximum else 0, text=f"{label}: {points}/{maximum}")

    st.markdown("### Alex's knowledge cards")
    for concept in chapter.concepts:
        state = alex_brain.concepts[concept.id]
        with st.expander(f"{concept.label} · level {state.level}/3"):
            if state.supporting_evidence:
                st.write("**Your supporting words**")
                for quote in state.supporting_evidence:
                    st.write(f"> {quote}")
            if state.missing_points:
                st.warning("Possible gaps: " + "; ".join(state.missing_points))
            if state.misconceptions:
                st.error("Transferred misconception: " + "; ".join(state.misconceptions))
            if state.level < 2 or state.misconceptions:
                if st.button("Repair this concept", key=f"purple_repair_{concept.id}"):
                    start_repair(st.session_state, concept.id)
                    st.rerun()

    st.markdown("### Decision replay")
    for index, decision in enumerate(attempt.decisions, start=1):
        status = "Success" if decision.success else "Gap exposed"
        st.markdown(f"**{index}. {decision.phase.title()} · {status}**")
        st.write(decision.explanation)
        st.caption(decision.consequence + (" · Assisted" if decision.assisted else " · Independent"))

    st.markdown("### Knowledge detective")
    diagnosis = next((c.label for c in chapter.concepts if c.id == attempt.diagnosis_concept_id), "No diagnosis")
    expected = [c.label for c in chapter.concepts if c.id in task.required_concepts]
    st.write(f"You diagnosed **{diagnosis}**. This mission depended on: **{', '.join(expected)}**.")

    gaps = [c for c in chapter.concepts if alex_brain.concepts[c.id].level < 2]
    if gaps:
        st.info("Recommended revision: " + ", ".join(c.label for c in gaps))
    else:
        st.success("All required concepts are understood. Try a rematch to test transfer.")

    history = st.session_state.get(key("attempt_history"), [])
    if history:
        previous = history[-1]
        prev_independent = sum(1 for d in previous["decisions"] if d["success"] and not d["assisted"])
        now_independent = sum(1 for d in attempt.decisions if d.success and not d.assisted)
        st.metric("Independent mission successes", now_independent, now_independent - prev_independent)

    if st.button("Start changed rematch", type="primary", key=f"purple_rematch_{task.task_id}"):
        start_rematch(st.session_state, chapter)
        st.rerun()
