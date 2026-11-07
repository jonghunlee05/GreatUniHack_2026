# Agent 2 · Event generator (v2)

Generates **one chapter's** playable content in a **single call**:

- **Time-travel era** (Justin): 4 scenes led by the real people behind the discovery
- **Assessment mission** (Shasha): briefing → investigate → Alex decides → curveball → score

Both halves share the same ILO and the same list of **concepts**, so a gap found in the assessment points straight back to what needs re-teaching.

> The system prompt in section 3 is loaded by the code at runtime (`apps/web/src/features/agent2/`). Edit it here.

---

## 1. When it runs

Agent 2 runs **only** when the player clicks **Generate** on an unlocked chapter. Nothing is generated in advance.

| State | Meaning | UI |
|---|---|---|
| `locked` | Previous chapter not passed | Padlock |
| `available` | Unlocked, not generated | "Generate" button |
| `generating` | Agent 2 running | Loading animation, button disabled |
| `ready` | Pack saved | "Enter era" |
| `in_progress` | Player has started | "Continue" |
| `completed` | Assessment passed | Stamp, next chapter → `available` |
| `failed` | Generation failed | Error + "Try again" |

Rules (enforced on the server):
- New game: chapter 1 is `available`, the rest are `locked`.
- Generate is allowed only from `available` or `failed`.
- Set `generating` **before** the API call, so double clicks can't trigger two calls.
- A saved pack is never regenerated.
- Passing chapter N sets chapter N+1 to `available` (still needs a click).

---

## 2. Input

Only this chapter's data, never the whole course.

```json
{
  "course": { "code": "MATS23801", "title": "Biomaterials and Biological Interactions" },
  "chapter": {
    "chapter_id": "ch1",
    "week": 1,
    "title": "What is tissue made of?",
    "main_ilo": "Explain that organs are built from several tissue types, and that tissue is made of cells, ECM and signalling molecules",
    "supporting_ilos": ["Name the four tissue categories and give an example of each"],
    "key_events": [
      { "id": "ev1", "year": "c. 1800", "person": "Xavier Bichat", "event": "Classifies the body into tissues by dissecting and chemically testing organs" },
      { "id": "ev2", "year": "1839", "person": "Theodor Schwann", "event": "Proposes that animals are made of cells" }
    ],
    "sources": [
      { "id": "src1", "file": "Necessary_Biochemistry_Doc.pdf", "page": 1, "excerpt": "..." },
      { "id": "src2", "file": "Introduction_Lecture_2026.pdf", "page": 16, "excerpt": "..." }
    ]
  },
  "previous_chapter": {
    "concepts": [{ "id": "...", "statement": "..." }],
    "knowledge_debt": [{ "half_truth": "...", "fix": "..." }]
  }
}
```

`previous_chapter` is empty for chapter 1.

---

## 3. System prompt

```
You are the event generator for "Teach Alex", a learning game for university students. You turn ONE course chapter into:
(A) a time-travel era, where the student learns the concept from the real people who discovered it, and
(B) an assessment mission, where the student and Alex (an AI apprentice who only knows what the student taught him) solve a modern problem using the concept.

FOCUS
- Everything must serve the chapter's main_ilo. Leave out any detail that doesn't help the student reach it.
- First, list 3–5 concepts: the specific ideas a student must understand to meet the ILO. Every scene, clue, evidence item and question must link to at least one concept id.

HISTORY AND REAL PEOPLE
- Use only the people, years and events in key_events. Do not invent events, dates, people or anecdotes.
- Real people may only talk about their own contribution as described in key_events.
- Write all dialogue as dramatised paraphrase. Never present words as a real person's actual quote.
- Mentors guide with questions. They never state the answer to the mentor question.

COURSE MATERIAL
- Scene 4 must end on the concept as taught in the course, citing at least one source id.
- The assessment must be solvable using only the concepts in this chapter (and previous_chapter concepts, if given).

ASSESSMENT
- Set the mission in a realistic biomaterials or applied situation.
- Alex's likely mistakes must each come from a specific missing or wrong concept, so that a student who taught Alex badly will see him make that mistake.
- If previous_chapter.knowledge_debt is not empty, the curveball must expose at least one of those half-truths.

SCENE ART AND INTERACTION (optional extras; keep them short)
- For each scene, add "art" so the game can draw it from its pixel-art library: the real kind of place, what is seen outside, time of day, weather, an ambient effect, 3–5 props, and a pose for each cast member in the scene. Use only values from the ART LIBRARY list at the end. Make each scene look different and true to the period.
- Hide each artefact clue in one of its scene's props by setting the clue's "prop" to that prop id. Course-material clues need no prop.
- mentor_chat: in scene 1 or 2, give 2–3 questions the student can ask the lead, each with a reply under 30 words that guides with a question or an observation. Replies never give the mentor-question answer.
- experiment: one hands-on recreation of the period's experiment or reasoning, in scene 2 or 3, so the student discovers the rule before scene 4 states it. Pick one template and fill "data":
  slider  { "label", "unit", "min", "max", "threshold", "below": what happens under it, "above": what happens over it, "visual": "flow" | "heat" | "bar" }
  sort    { "groups": [2–4 names], "items": [{ "label", "group" }] (3–8) }
  order   { "steps": [3–6 steps in the correct order] }
  match   { "pairs": [{ "left", "right" }] (3–5) }
  numeric { "question", "answer": number, "unit", "tolerance", "hint" }
  Add a "prediction" the student answers first, and a "reveal" explaining the result. Use only this chapter's concepts.

STYLE
- British English, second-year university level.
- Scene text under 80 words. Clues and evidence under 50 words. Dialogue lines under 25 words.

OUTPUT
- Valid JSON only, exactly matching the schema. No other text.
```

---

## 4. Output schema

```json
{
  "chapter_id": "ch1",
  "main_ilo": "copied exactly from input",

  "concepts": [
    { "id": "c1", "statement": "Organs are made of several tissue types" },
    { "id": "c2", "statement": "There are four tissue categories: connective, epithelial, nervous, muscle" },
    { "id": "c3", "statement": "Tissue = cells + ECM + signalling molecules" }
  ],

  "era": {
    "setting": { "place": "Paris", "year": "c. 1800", "skin": "sepia | postwar | chemlab | modern" },
    "cast": [
      { "name": "Xavier Bichat", "role": "lead", "event_ids": ["ev1"], "scenes": [1, 2, 3, 4] },
      { "name": "Theodor Schwann", "role": "cameo", "event_ids": ["ev2"], "scenes": [3] }
    ],
    "scenes": [
      {
        "n": 1,
        "type": "problem",
        "text": "string",
        "dialogue": [{ "speaker": "Xavier Bichat", "line": "string" }],
        "clue_ids": [],
        "concept_ids": ["c1"]
      },
      { "n": 2, "type": "failed_attempts", "text": "string", "dialogue": [], "clue_ids": ["k1"], "concept_ids": ["c1"],
        "art": { "location": "study", "view": "city", "time": "dusk", "weather": "rain", "ambient": "flicker", "props": ["dissection_table", "specimen_jars", "candle"], "poses": [{ "name": "Xavier Bichat", "pose": "experiment" }] } },
      { "n": 3, "type": "breakthrough", "text": "string", "dialogue": [], "clue_ids": ["k2", "k3"], "concept_ids": ["c1", "c3"] },
      { "n": 4, "type": "todays_rule", "text": "string", "dialogue": [], "clue_ids": ["k4"], "concept_ids": ["c2", "c3"] }
    ],
    "clues": [
      { "id": "k1", "type": "artefact", "title": "string", "text": "string", "concept_ids": ["c1"], "prop": "specimen_jars" },
      { "id": "k4", "type": "course_material", "title": "string", "text": "string", "source_id": "src2", "concept_ids": ["c3"] }
    ],
    "mentor_question": {
      "asked_by": "Xavier Bichat",
      "scene": 3,
      "question": "string",
      "key_points": ["string"],
      "hints": ["string", "string"],
      "mcq_fallback": { "options": ["string", "string", "string", "string"], "correct_index": 0 }
    },
    "field_notes": [
      { "concept_id": "c1", "note": "string" },
      { "concept_id": "c3", "note": "string" }
    ],
    "what_really_happened": { "summary": "string", "event_ids": ["ev1", "ev2"] },
    "mentor_chat": { "scene": 1, "options": [{ "ask": "string", "reply": "string" }] },
    "experiment": {
      "scene": 2,
      "template": "sort",
      "title": "string",
      "prompt": "string",
      "prediction": { "question": "string", "options": ["string", "string", "string"], "correct_index": 0 },
      "data": { "groups": ["string", "string"], "items": [{ "label": "string", "group": "string" }] },
      "reveal": "string",
      "concept_ids": ["c1"]
    }
  },

  "assessment": {
    "briefing": {
      "title": "string",
      "situation": "string",
      "task": "string",
      "objective": "string"
    },
    "stage1_investigate": {
      "evidence": [
        { "id": "e1", "title": "string", "text": "string", "relevant": true, "concept_ids": ["c3"] },
        { "id": "e2", "title": "string", "text": "string", "relevant": false, "concept_ids": [] }
      ]
    },
    "stage2_alex_decides": {
      "decision_prompt": "string",
      "correct_decision": "string",
      "requires_concepts": ["c1", "c3"],
      "likely_mistakes": [
        { "id": "m1", "alex_says": "string", "missing_concept": "c3", "why_wrong": "string" }
      ]
    },
    "stage3_curveball": {
      "new_condition": "string",
      "correct_response": "string",
      "tests_concepts": ["c2"],
      "exposes_debt": "string or null"
    },
    "scoring": {
      "stage1_points": 30,
      "stage2_points": 40,
      "stage3_points": 30,
      "pass_mark": 70
    }
  }
}
```

### Who uses what

| Field | Used by |
|---|---|
| `concepts` | Everyone: the shared contract |
| `era.*` | Time-travel (Justin) |
| `era.field_notes` | Teaching room (Shasha): what Alex should be taught |
| `era.mentor_question` | Examiner call in scene 3 (cheap model) |
| `assessment.*` | Assessment room (Shasha) |
| Gaps (concept ids missed in assessment) | Loop back to the teaching room, showing those field notes |

**Gaps found?** = any concept in `requires_concepts` or `tests_concepts` that the player lost points on. Scoring itself is done in code by the assessment room, not by Agent 2.

---

### Optional extras

`scenes[].art`, `clues[].prop`, `era.mentor_chat` and `era.experiment` are optional. The code repairs or drops a malformed extra (unknown props removed, a hidden clue whose prop isn't in its scene becomes a normal card, an experiment whose data doesn't fit its template is skipped) instead of rejecting the chapter. Scenes without art use a default room for the era skin. The allowed art values (ART LIBRARY) are appended to the system prompt by the code from `apps/web/src/features/time-travel/art/catalog.ts`.

## 5. Validation (code, after every call)

Reject and retry once, then set `failed`, if any check fails:

- [ ] Valid JSON matching the schema
- [ ] `main_ilo` matches the input exactly
- [ ] 3–5 concepts; every scene, clue, field note, evidence item and mistake references real concept ids
- [ ] Every concept appears in at least one field note **and** is tested somewhere in the assessment
- [ ] Every cast member's `event_ids` exist in the input `key_events`
- [ ] No year in the era that isn't in `key_events` (a decade such as "1750s" is accepted when a key event falls in it)
- [ ] At least one `course_material` clue with a valid `source_id`
- [ ] Exactly 4 scenes, of types problem → failed_attempts → breakthrough → todays_rule
- [ ] Stage 1 has at least one `relevant: false` evidence item (so investigating takes judgement)
- [ ] 2–4 likely mistakes, each with a `missing_concept`
- [ ] Scoring points add up to 100

---

## 6. Cost controls

- One call per chapter, only on click, then stored forever.
- Input = one chapter's outline entry + its source excerpts only.
- Set a max output token limit.
- Log input and output tokens for every call.
- During play, the only LLM use is the scene 3 examiner check (with `mcq_fallback` if the budget runs low) and Alex's live replies in Shasha's rooms.
