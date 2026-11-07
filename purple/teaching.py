"""Streamlit Teaching Room."""

from __future__ import annotations

from .alex_engine import AlexBrain
from .contracts import Chapter
from .state import key


def render_teaching_room(chapter: Chapter, alex_brain: AlexBrain) -> AlexBrain:
    import streamlit as st

    with st.sidebar:
        st.markdown("### Current chapter")
        st.write(chapter.title)
        for objective in chapter.learning_objectives:
            st.caption(f"🎯 {objective.text}")
        st.progress(alex_brain.progress, text=f"Alex's learning: {alex_brain.progress:.0%}")
        st.markdown("### Knowledge cards")
        for concept in chapter.concepts:
            knowledge = alex_brain.concepts[concept.id]
            st.markdown(f"**{concept.label}** · {knowledge.level}/3")
            if knowledge.misconceptions:
                st.caption("⚠️ " + knowledge.misconceptions[-1])

    repair_target = st.session_state.get(key("repair_target"))
    if repair_target:
        label = next((c.label for c in chapter.concepts if c.id == repair_target), repair_target)
        st.warning(f"Repair mission: give Alex new evidence about **{label}**. Clicking Repair did not change mastery.")

    st.markdown("## 🧑‍🚀 Teaching Room")
    st.caption("Teach Alex in your own words. Alex stores only evidence from this conversation.")
    for message in st.session_state[key("conversation")]:
        with st.chat_message(message["role"], avatar="🧑‍🚀" if message["role"] == "assistant" else "🧑‍🏫"):
            st.write(message["content"])

    words = st.chat_input("Explain one idea to Alex…", key="purple_teaching_chat")
    with st.expander("Optional voice or sketch/image"):
        if hasattr(st, "audio_input"):
            audio = st.audio_input("Record an explanation", key="purple_voice")
            if audio:
                st.info("Audio captured. Offline demo does not transcribe it; add the transcript in chat.")
        st.file_uploader("Upload a sketch or diagram", type=["png", "jpg", "jpeg"], key="purple_sketch")

    if words:
        st.session_state[key("conversation")].append({"role": "user", "content": words})
        evaluation = alex_brain.evaluate_and_learn(chapter, words)
        response = evaluation.next_question
        st.session_state[key("conversation")].append({"role": "assistant", "content": response})
        st.session_state[key("brain")] = alex_brain.model_dump()
        st.rerun()

    st.divider()
    if st.button("Ask Alex to teach it back", key="purple_teachback"):
        for summary in alex_brain.teach_back(chapter):
            st.info(summary, icon="🧑‍🚀")
    if st.button("Finish teaching → Mission Control", type="primary", key="purple_finish_teaching"):
        st.session_state[key("brain")] = alex_brain.model_dump()
        st.session_state[key("room")] = "assessment"
        st.rerun()
    return alex_brain
