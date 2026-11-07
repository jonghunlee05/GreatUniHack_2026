"""Streamlit Teaching Room. All AI logic lives in `alex_agent`; this file is UI only."""

from __future__ import annotations

import hashlib

from .alex_agent import (
    AlexConfigError,
    feedback_from_attempt,
    process_teaching_turn,
    resolve_api_key,
    run_alex_action,
)
from .alex_brain import BrainStore
from .alex_engine import AlexBrain
from .alex_media import (
    VoiceUnavailable,
    image_input,
    speech_available,
    synthesize_speech,
    transcribe_audio,
    transcription_available,
)
from .alex_schemas import TeachingInput
from .contracts import AssessmentTask, Attempt, Chapter
from .state import key

REACTION_FACES = {
    "curious": "🤔 curious", "confused": "😵‍💫 confused", "thinking": "💭 thinking",
    "understanding": "💡 understanding", "got_it": "🌟 got it!",
}
STRATEGY_BADGES = {
    "CLARIFY": "🔍 clarify", "CHALLENGE": "⚔️ challenge", "EXAMPLE": "🧪 example",
    "APPLY": "🛠️ apply", "TRANSFER": "🔀 transfer", "SUMMARISE": "📝 summarise",
    "SCAFFOLD": "🪜 scaffold", "PROGRESS": "➡️ progress",
}


def render_teaching_room(chapter: Chapter, alex_brain: AlexBrain) -> AlexBrain:
    import streamlit as st

    store = BrainStore(st.session_state)
    alex_state = store.load(chapter)
    # Keep the legacy brain key (read by assessment/report) in sync with Agent 3's state.
    if alex_state.turn == 0 and any(k.level for k in alex_brain.concepts.values()):
        alex_state.brain = alex_brain
    conversations = st.session_state.setdefault(key("conversations"), {})
    conversation = st.session_state[key("conversation")]

    with st.sidebar:
        st.markdown("### Current chapter")
        st.write(chapter.title)
        for objective in chapter.learning_objectives:
            marker = "👉 " if objective.id == alex_state.current_objective_id else "🎯 "
            st.caption(marker + objective.text)
        brain = alex_state.brain
        st.progress(brain.progress, text=f"Alex's learning: {brain.progress:.0%}")
        st.markdown("### Knowledge cards")
        expand_all = st.session_state.pop("purple_expand_cards", False)
        for concept in chapter.concepts:
            knowledge = brain.concepts[concept.id]
            focus = " 👈" if concept.id == alex_state.current_concept_id else ""
            st.markdown(f"**{concept.label}** · {knowledge.level}/3{focus}")
            with st.expander("Details", expanded=expand_all):
                if knowledge.supporting_evidence:
                    st.caption("Your words")
                    for quote in knowledge.supporting_evidence[-3:]:
                        st.write(f"> {quote}")
                else:
                    st.caption("No teaching evidence yet.")
                for item in knowledge.misconceptions:
                    st.error(item, icon="⚠️")
                if knowledge.missing_points:
                    st.caption("Still missing: " + "; ".join(knowledge.missing_points))
        readiness = {
            "learning": "📚 Still learning",
            "needs_review": "⚠️ Needs review",
            "ready_for_assessment": "✅ Alex feels ready for the assessment",
        }[alex_state.readiness]
        st.markdown(f"**Readiness:** {readiness}")

    last_alex = next((m for m in reversed(conversation) if m["role"] == "assistant"), {})
    st.markdown(f"## 🧑‍🚀 Teaching Room · Alex looks {REACTION_FACES.get(last_alex.get('reaction', 'curious'))}")
    if resolve_api_key():
        st.caption("Teach Alex in your own words. Alex only learns from what you explain.")
    else:
        st.warning(
            "**Offline demonstration.** No Claude API key found, so Alex uses a simple keyword "
            "evaluator. Set `ANTHROPIC_API_KEY` (or add it to `apps/web/.env.local`) for real understanding."
        )

    feedback = _pending_assessment_feedback(st, chapter, alex_state.brain)
    if feedback:
        st.warning(f"Repair mission: {feedback.recommended_revision}. Alex only improves from new teaching.")

    for message in conversation:
        avatar = "🧑‍🚀" if message["role"] == "assistant" else "🧑‍🏫"
        with st.chat_message(message["role"], avatar=avatar):
            if message.get("image"):
                st.image(message["image"], width=240)
            st.write(message["content"])
            if message.get("strategy"):
                st.caption(STRATEGY_BADGES.get(message["strategy"], message["strategy"]))

    _speak_latest(st, last_alex)
    toolbar = st.columns(5)
    labels = [("challenge", "⚔️ Challenge me"), ("teach_back", "📝 Teach-back"),
              ("give_example", "🧪 Give an example"), ("check_memory", "🧠 Check memory")]
    for column, (action, label) in zip(toolbar, labels):
        if column.button(label, key=f"purple_action_{action}"):
            _run_action(st, chapter, alex_state, store, conversation, conversations, action)
    if speech_available():
        toolbar[4].toggle("🔊 Voice", key="purple_voice_on", value=True)
    if last_alex.get("strategy") == "SUMMARISE":
        c1, c2, c3 = st.columns(3)
        if c1.button("✅ That's right", key="purple_tb_confirm"):
            st.session_state["purple_pending_text"] = "Yes, that's right."
        if c2.button("✏️ Correct Alex", key="purple_tb_correct"):
            st.info("Type your correction in the chat box — Alex will evaluate it like any teaching.")
        if c3.button("🧪 Another example", key="purple_tb_example"):
            _run_action(st, chapter, alex_state, store, conversation, conversations, "give_example")

    submission: TeachingInput | None = None
    if st.session_state.get("purple_pending_text"):
        submission = TeachingInput(text=st.session_state.pop("purple_pending_text"))
    words = st.chat_input("Explain one idea to Alex…", key="purple_teaching_chat")
    if words:
        submission = TeachingInput(text=words)

    with st.expander("🎙️ Teach by voice or 🖼️ with a drawing"):
        voice_tab, image_tab = st.tabs(["Voice", "Image / drawing"])
        with voice_tab:
            submission = _voice_input(st, chapter) or submission
        with image_tab:
            submission = _image_input(st) or submission

    if submission is not None:
        # Stable ID: same chapter + position + content → same ID, so reruns never re-call the model.
        turn_id = _turn_id(chapter.chapter_id, len(conversation), submission)
        try:
            with st.spinner("Alex is thinking…"):
                result = process_teaching_turn(
                    chapter.game_id,
                    chapter,
                    alex_state,
                    submission,
                    conversation,
                    assessment_feedback=feedback,
                    turn_id=turn_id,
                )
        except AlexConfigError as exc:
            st.error(str(exc))
            return alex_brain
        if result["mode"] != "cached":
            user_entry = {"role": "user", "content": submission.text or "(drawing)"}
            if submission.has_image:
                user_entry["image"] = submission.image_bytes
            conversation.append(user_entry)
            conversation.append({
                "role": "assistant",
                "content": result["alex_reply"],
                "strategy": result["strategy"],
                "reaction": result["reaction"],
                "turn_id": result["turn_id"],
            })
        if feedback:
            st.session_state[key("repair_target")] = None
            st.session_state[key("feedback_sent")] = True
        updated = alex_state.model_validate(result["updated_brain"])
        store.save(updated)
        st.session_state[key("brain")] = updated.brain.model_dump()
        conversations[chapter.chapter_id] = list(conversation)
        for warning in result["warnings"]:
            st.toast(warning)
        st.session_state.pop("purple_voice_transcript", None)
        st.rerun()

    st.divider()
    if st.button("Finish teaching → Mission Control", type="primary", key="purple_finish_teaching"):
        st.session_state[key("brain")] = alex_state.brain.model_dump()
        st.session_state[key("room")] = "assessment"
        st.rerun()
    return alex_state.brain


def _voice_input(st, chapter: Chapter) -> TeachingInput | None:
    if not hasattr(st, "audio_input"):
        st.caption("Voice input needs Streamlit ≥ 1.40.")
        return None
    audio = st.audio_input("Record an explanation", key=f"purple_voice_{chapter.chapter_id}")
    if audio is not None:
        audio_bytes = audio.getvalue()
        audio_hash = hashlib.sha256(audio_bytes).hexdigest()[:12]
        if st.session_state.get("purple_voice_hash") != audio_hash:
            st.session_state["purple_voice_hash"] = audio_hash
            transcript = ""
            if transcription_available():
                try:
                    with st.spinner("Transcribing with ElevenLabs…"):
                        transcript = transcribe_audio(audio_bytes, "speech.wav", audio.type or "audio/wav")
                except VoiceUnavailable as exc:  # never block teaching
                    st.info(f"Couldn't transcribe automatically ({exc}). Type what you said below.")
            st.session_state["purple_voice_transcript"] = transcript
    if not transcription_available():
        st.caption("Automatic transcription is off (no ELEVENLABS_API_KEY). Type or paste what you said.")
    transcript = st.text_area(
        "Review your transcript before sending",
        key="purple_voice_transcript",
        placeholder="Your spoken explanation appears here…",
    )
    if st.button("Send voice explanation", disabled=not transcript.strip(), key="purple_send_voice"):
        return TeachingInput(text=transcript.strip(), modality="voice")
    return None


def _image_input(st) -> TeachingInput | None:
    upload = st.file_uploader(
        "Upload a sketch, whiteboard photo or diagram",
        type=["png", "jpg", "jpeg", "webp", "gif"],
        key="purple_sketch",
    )
    note = st.text_input("Explain what your drawing shows (recommended)", key="purple_sketch_note")
    if upload is not None:
        st.image(upload, width=240)
    if st.button("Show Alex this image", disabled=upload is None, key="purple_send_image"):
        try:
            return image_input(upload.getvalue(), upload.type or "image/png", note.strip())
        except ValueError as exc:
            st.error(str(exc))
    return None


def _pending_assessment_feedback(st, chapter: Chapter, brain: AlexBrain):
    """Turn a report-room repair request into AssessmentFeedback, sent once."""
    target = st.session_state.get(key("repair_target"))
    if not target or st.session_state.get(key("feedback_sent")):
        return None
    try:
        task = AssessmentTask.model_validate(st.session_state[key("task")])
        history = st.session_state.get(key("attempt_history")) or []
        attempt_raw = st.session_state.get(key("attempt"))
        attempt = Attempt.model_validate(attempt_raw) if attempt_raw else None
        if attempt is None or not attempt.completed:
            attempt = Attempt.model_validate(history[-1]) if history else None
    except Exception:
        attempt, task = None, None
    feedback = feedback_from_attempt(chapter, task, attempt, brain) if (task and attempt) else None
    if feedback is None:
        from .alex_schemas import AssessmentFeedback

        label = next((c.label for c in chapter.concepts if c.id == target), target)
        feedback = AssessmentFeedback(
            chapter_id=chapter.chapter_id, failed_concepts=[target],
            recommended_revision=f"Re-explain {label}",
        )
    elif target not in feedback.failed_concepts:
        feedback.failed_concepts.insert(0, target)
    return feedback


def _turn_id(chapter_id: str, position: int, submission: TeachingInput) -> str:
    digest = hashlib.sha256(f"{chapter_id}|{position}|{submission.modality}|{submission.text}".encode())
    if submission.image_bytes:
        digest.update(submission.image_bytes)
    return digest.hexdigest()[:16]


def _run_action(st, chapter, alex_state, store, conversation, conversations, action: str) -> None:
    turn_id = _turn_id(chapter.chapter_id, len(conversation), TeachingInput(text=f"[{action}]"))
    with st.spinner("Alex is thinking…"):
        result = run_alex_action(chapter.game_id, chapter, alex_state, action, turn_id=turn_id)
    if result["mode"] != "cached":
        conversation.append({
            "role": "assistant", "content": result["alex_reply"], "strategy": result["strategy"],
            "reaction": result["reaction"], "turn_id": result["turn_id"],
        })
    updated = alex_state.model_validate(result["updated_brain"])
    store.save(updated)
    st.session_state[key("brain")] = updated.brain.model_dump()
    conversations[chapter.chapter_id] = list(conversation)
    if action == "check_memory":
        st.session_state["purple_expand_cards"] = True
    st.rerun()


def _speak_latest(st, message: dict) -> None:
    """Play Alex's latest reply once (ElevenLabs, cached by turn ID); text is always shown."""
    turn_id = message.get("turn_id")
    if not turn_id or not speech_available() or not st.session_state.get("purple_voice_on", True):
        return
    try:
        audio = synthesize_speech(message["content"], turn_id)
    except VoiceUnavailable:
        return
    autoplay = st.session_state.get("purple_spoken") != turn_id
    st.session_state["purple_spoken"] = turn_id
    st.audio(audio, format="audio/mpeg", autoplay=autoplay)
