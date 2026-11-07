# TeachBack purple rooms

This package implements the Teaching Room, Mission Control assessment, knowledge-gap report, repair loop, and changed-task rematch. It is deliberately separate from `apps/web`; Justin's existing Next.js pages and generator are unchanged.

## Run the standalone demo

Python 3.10+ is recommended.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
streamlit run demo_purple.py
```

No API key is required. The offline evaluator is deterministic and conservative. Text teaching is complete; voice capture and image upload are accepted as optional inputs, but the offline demo does not transcribe or interpret them.

For optional live source-grounded teaching evaluation through an OpenAI-compatible endpoint:

```bash
export PURPLE_LLM_API_KEY="..."
export PURPLE_LLM_MODEL="gpt-4.1-mini"
# optional: export PURPLE_LLM_BASE_URL="https://your-provider.example/v1"
streamlit run demo_purple.py
```

Keys remain server-side. Invalid credentials, timeouts, malformed structured output, or unavailable providers automatically fall back to offline mode.

Run tests:

```bash
pytest -q
```

## Contracts

All integration contracts are Pydantic models in `purple/contracts.py` and support `model_dump()` / `model_validate()` for JSON exchange:

- `Chapter`: grounded objectives and concepts.
- `AlexBrain`: concept levels, verbatim student evidence, missing points, misconceptions, confidence, and update turn.
- `AssessmentTask`: validated evidence, actions, answer, curveball, and sources.
- `Attempt`: evidence and decision history, assistance, diagnosis, and deterministic scoring.

Mastery levels are `0 Not learned`, `1 Recognised`, `2 Understood`, and `3 Applied`. Clicking Repair never changes mastery; only a newly evaluated explanation can do that.

## Integration guide for Justin

The current TypeScript generator emits `week/title/summary/ilos/sourceRefs`. Adapt it without changing the web app:

```python
from purple.contracts import Chapter

chapter = Chapter.from_generated_chapter(
    generated_chapter_dict,
    game_id=game_id,
    subject=generated_game["course"]["subject"],
)
```

For better assessment grounding, extend the generator later to provide native `concepts` entries with `reference_explanation`, `key_points`, `common_misconceptions`, and `source_ref`.

In a Streamlit host, initialise state once and call the room renderers:

```python
from purple.state import initialise
from purple.teaching import render_teaching_room
from purple.assessment import render_assessment_room
from purple.report import render_report_room

initialise(st.session_state, chapter)
# Select exactly one renderer using your own navigation.
```

All state keys start with `purple_`. Navigation is internal only in `demo_purple.py`; host applications may call the render functions and use the documented Pydantic state contracts instead. The existing JSON game files in `apps/web/data/games/` can be read and adapted by a thin Python API or exported by a future Next.js route.

## MVP boundaries

- Working: text teaching, adaptive focused questions, evidence-bound brain, teach-back, Evidence Hunt, deterministic Alex decisions, ask-why, one hint, pause/explain assistance, curveball, transparent scoring, replay, diagnosis, repair, rematch, two subjects, offline operation.
- Partial: generated-chapter grounding is limited by the existing generator's lack of reference explanations; generic tasks are conservative.
- Optional: live LLM teaching evaluation is implemented through a structured OpenAI-compatible response and falls back safely.
- Mocked/optional: voice transcription, sketch interpretation, and live LLM task generation. They never block the playable loop.
