# Agent 3 — Alex, the adaptive AI apprentice

The student teaches Alex. On each turn, Alex works out how good the explanation was, updates his knowledge from the student's exact words, and asks one focused question chosen by an adaptive strategy.

## Run it

```bash
source .venv/bin/activate
pip install -r requirements.txt
streamlit run demo_purple.py          # Teaching → Assessment → Report → Repair
pytest -q                             # never calls the real API
```

**Claude key:** set `ANTHROPIC_API_KEY`, or put it in `apps/web/.env.local` (the same file the web app uses). Without a key, the room runs a clearly labelled **offline demonstration** with a simple keyword evaluator. Set `ALEX_OFFLINE=1` to force offline mode.

| Env var | Default | Purpose |
|---|---|---|
| `ALEX_MODEL` | `claude-opus-5-5` | Claude model (see benchmark below) |
| `ALEX_EFFORT` | `low` | Thinking effort |
| `ELEVENLABS_API_KEY` | — | Voice: Scribe v2 speech-to-text and TTS |
| `ELEVENLABS_VOICE_ID` | — | Alex's TTS voice (TTS is off without it) |
| `ELEVENLABS_TTS_MODEL` | `eleven_flash_v2_5` | Optional TTS model |
| `ALEX_PYTHON` | `<repo>/.venv/bin/python` | Python used by the Next.js bridge |

All of these can go in `apps/web/.env.local`; both the web app and the Python code read that file.

## Next.js Teaching Room (production)

`apps/web/src/app/api/alex/route.ts` is a thin bridge. It loads the game and chapter server-side from `data/games`, then runs `python -m purple.web_bridge` with JSON on stdin and stdout. It also coalesces repeated `turnId`/`responseId` requests, so a double click causes only one Claude call. The bridge commands are `turn`, `action`, `transcribe`, `speak` and `status`.

- The client stores Agent 3's `AlexState` opaquely in `PurpleState.alexStates[week]`.
- Each response also returns a `webBrain` in the web's existing `BrainState` shape (same `conceptId` slugs), so the TypeScript assessment and report rooms keep working unchanged.
- If the bridge fails, text teaching falls back to the existing local `evaluateTeaching`.
- Teammate-owned change: `components/pixel/AlexSprite.tsx` gained five moods (`curious`, `confused`, `thinking`, `understanding`, `got_it`). The existing moods are unchanged.

## Toolbar actions (`run_alex_action`)

| Action | What happens | API call |
|---|---|---|
| Check memory | Alex lists what he remembers, and the knowledge cards expand | none |
| Teach-back | Alex explains using only stored evidence, then asks to confirm. **That's right** → APPLY (or PROGRESS if the concept is complete). **Correct Alex** → the correction goes through the normal evaluator. **Another example** → Give an example | 1 short call |
| Give an example | Alex invents an example from what he was taught and asks if it's right | 1 short call |
| Challenge me | APPLY or TRANSFER scenario; the student's answer is judged as an application | 1 short call |

Actions never change mastery. They reuse the cached system prompt and chapter block, and fall back to canned replies if Claude fails.

## Voice

- **Speech-to-text:** record (MediaRecorder on the web, `st.audio_input` in Streamlit) → ElevenLabs Scribe v2 → an editable transcript → the student presses **Teach Alex**, which sends it through `process_teaching_turn` with `modality="voice"` and the same turn-ID protection.
- **Text-to-speech:** each Alex reply is spoken once, cached on disk in `.cache/alex_tts/`, keyed by response ID and voice. Replies have replay buttons, and there's a mute toggle. If ElevenLabs fails or isn't configured, Alex just shows text.

## Chapter grounding: what Agent 2 should add

Web-generated chapters only have `ilos[].keyConcepts` and a `summary`. Agent 3 marks those concepts `reference_quality: "weak"`: mastery is capped at 2, and Claude only flags a misconception when the claim clearly contradicts the summary or objective. The minimum fields needed per concept for full grounding:

```json
"concepts": [{
  "label": "Proportional gain",
  "iloId": "W1.1",
  "referenceExplanation": "2-3 sentences from the source material",
  "keyPoints": ["...", "..."],
  "commonMisconceptions": ["..."],
  "sourceRef": "lecture2.pdf p3"
}]
```

`Chapter.from_generated_chapter` would map these onto the existing `Concept` fields. Nothing in Agent 1 or Agent 2 was changed.

## Benchmark (`scripts/bench_alex.py`, 6-turn economics conversation)

| Model | Median turn | Template replies | Notes |
|---|---|---|---|
| `claude-opus-5-5` (default) | 4.0 s | 0% | correct quality on every turn |
| `claude-sonnet-5-5` | 3.3 s | 17% | slightly faster |
| `claude-haiku-5-5` | 4.1 s | 0% | misjudged 2 of 6 explanations |

The web bridge adds about 0.7 s per turn for starting Python.

## Calling it from the Teaching Room

```python
from purple import process_teaching_turn, BrainStore, TeachingInput

store = BrainStore(st.session_state)          # one saved state per chapter
state = store.load(chapter)

result = process_teaching_turn(
    game_id, chapter_pack, state, "The browser sends a request…",   # or TeachingInput(...)
    conversation_history, assessment_feedback=None,
    turn_id=stable_id,        # same ID again (a rerun) returns the cached result and makes no API call
)
store.save(AlexState.model_validate(result["updated_brain"]))
```

`chapter_pack` can be a purple `Chapter`, its dict, or a web-generator chapter (`ilos`/`keyConcepts`).

The result contains `alex_reply`, `strategy`, `target_concept_id`, `explanation_quality`, `updated_concept_evaluations`, `supporting_evidence`, `misconceptions`, `next_question`, `readiness` (`learning` | `needs_review` | `ready_for_assessment`), `teaching_progress_summary`, `mode` (`claude` | `offline-demo` | `offline-fallback` | `cached`), `reply_source`, `warnings` and `updated_brain`.

Alex only **reports** readiness. He never scores, unlocks chapters or judges assessments.

## How a turn works

1. **One Claude call** (`beta.messages.parse`, structured output = `AlexModelOutput`). The persona and rules form a fixed system prompt, followed by the current chapter pack, which is prompt-cached. The volatile part is the last 6 messages, a compressed summary of older turns, the game state, and the new message, with any image attached.
2. **Deterministic validation** (`alex_brain.apply_evaluations`):
   - Unknown concepts are ignored.
   - Evidence must be a verbatim quote of the student's words.
   - Mastery goes up by at most one level per turn, or straight to 2 for a correct definition.
   - Level 3 needs earlier evidence plus an applied explanation.
   - A misconception caps mastery at 1.
   - Images are never evidence on their own.
3. **Deterministic strategy policy** (`alex_agent.decide`):

| Situation | Strategy |
|---|---|
| Vague / partial / off-topic | CLARIFY |
| Misconception | CHALLENGE |
| 3 weak turns in a row on one concept | SCAFFOLD |
| Correct definition, no example | EXAMPLE |
| Correct and applied | APPLY → then TRANSFER → then concept done |
| ≥ 2 newly finished concepts | SUMMARISE (teacher confirms) |
| Concept done | PROGRESS to the next concept. Open misconceptions come first, then assessment failures, then the current objective, then later objectives |
| Assessment feedback pending | CLARIFY on the failed concept, acknowledging the mistake |

   Claude receives this table already worked out for the current state. If Claude's chosen strategy disagrees with the policy, or its question repeats a recent one, Alex uses a canned reply for the policy's strategy instead (`reply_source: "template"`).
4. **Failures never block teaching or corrupt the brain.** Network errors, refusals and malformed output fall back to the offline evaluator for that turn (`mode: "offline-fallback"`).

## Assessment feedback

Pass an `AssessmentFeedback` (`chapter_id`, `failed_concepts`, `alex_mistake`, `recommended_revision`). Concept IDs that don't match exactly are mapped to the closest concept. Alex acknowledges the mistake and steers the conversation to re-teaching. The feedback is cleared only when new supporting evidence arrives, and mastery doesn't change until then. The purple report room's **Repair** button sends this automatically (`feedback_from_attempt`).

## Files

| File | Role |
|---|---|
| `purple/alex_agent.py` | `process_teaching_turn`, strategy policy, Claude and offline evaluators, replies |
| `purple/alex_brain.py` | `AlexState` (per-chapter memory), `BrainStore`, evidence-based merge |
| `purple/alex_prompts.py` | System prompt, chapter block, per-turn prompt |
| `purple/alex_schemas.py` | Pydantic contracts (model output, input, result, feedback) |
| `purple/alex_media.py` | Voice transcription and image validation |
| `purple/teaching.py` | Streamlit UI only |

## Status

- **Working (web and Streamlit):**
  - Text, voice and whiteboard/image teaching.
  - All 8 strategies, with Alex's reactions shown on the sprite.
  - Expandable knowledge cards.
  - The four toolbar actions.
  - Per-chapter save/restore and the assessment feedback loop.
  - Duplicate-call protection.
- **Needs keys:** voice needs `ELEVENLABS_API_KEY`, and spoken replies also need `ELEVENLABS_VOICE_ID`.
- **Partial:** web-generated chapters run with weak grounding until Agent 2 adds the fields above.
- **Offline demo only:** the keyword evaluator is conservative and can't understand paraphrases or images.
