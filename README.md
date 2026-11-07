# Teach Alex (working title)

> Teach Alex through history's real engineering problems. If you get it wrong, you change the future.

Built for **Reply Student Tech Clash 2026 · AI on Campus UK** (Direction: Learning).

---

## 1. The idea

Students often learn engineering rules (e.g. "always add a ground plane") without knowing *why* they exist. Labs turn into cookbook exercises and the understanding doesn't stick.

This app turns a course into a game:

1. **Discover**: the student learns a concept by investigating a real historical problem.
2. **Teach**: the student explains it to **Alex**, an AI apprentice who only knows what he is taught.
3. **Test**: the student, Alex and a problem meet in the assessment room.
4. **Reflect**: when Alex fails, the student finds the gap in their own understanding.

Example course used for the prototype: **PCB design**.

---

## 2. App structure

![App flow](docs/app-flow.png)

```
Home
 └── [+] New game
      └── Upload course materials (PDF, slides, notes)
           └── Generates a game with 4 sections:
                ├── Profile          → badges, stars, progress
                ├── Time-travel      → the timeline of eras / chapters
                ├── Teaching room    → teach the content to Alex
                └── Assessment room  → weekly interactive task: me + Alex + a problem
```

### 2.1 Home
- Lists all games the user has created.
- `+` button opens the "New game" flow (upload materials → generate game).

### 2.2 Profile
- Badges, stars per chapter, overall progress.
- Alex's brain map (what Alex currently knows / misunderstands). *(stretch)*

### 2.3 Time-travel (owner: **me**)
- The course as a timeline of historical eras; each era is a chapter with one learning outcome.
- Example (PCB): 1930s wiring nightmare → 1940s built to survive → 1960s–80s density → today signal integrity.
- Handles: chapter generation from course materials, the era's mentor character, knowledge debt across eras.
- *Details to be defined.*

### 2.4 Teaching room (owner: **friend**)
- Student explains the concept to Alex by chat (and sketching, stretch).
- Alex asks naive questions, interrupts on jargon, and builds his "brain" only from what he is taught.
- Alex teaches it back at the end, including the student's mistakes.

### 2.5 Assessment room (owner: **friend**)
- Weekly interactive task: the student and Alex solve a problem together.
- Alex applies only what he was taught; misconceptions show up as failures.
- Candidate mechanics: predict-the-failure, mission control (pause / limited hints), curveball constraint, sabotage heist, Alex's planted false statement, short oral defence.
- Grading: stars tied to understanding (works / caught mistakes early / defended the design).

---

## 3. Shared concepts (agree on these first)

| Concept | Description |
|---|---|
| `Game` | One uploaded course. Contains chapters. |
| `Chapter` | One era + one learning outcome + source material references. |
| `AlexBrain` | Structured record of what Alex was taught (concepts, confidence, misconceptions). Shared by teaching and assessment rooms. |
| `Attempt` | One assessment run: result, stars, mistakes found, hints used. |
| `Badge` | Earned achievements shown on the profile. |

> `AlexBrain` is the contract between the teaching room and the assessment room. Agree its shape before building either.

---

## 4. Suggested tech stack (proposal, open to change)

- **Frontend:** Next.js + TypeScript + Tailwind
- **Backend:** API routes or a small Python (FastAPI) service
- **LLM:** any chat model API with streaming
- **Storage:** SQLite (or JSON files) for games, chapters, Alex's brain and attempts
- **File parsing:** PDF / slides text extraction for uploaded course materials

---

## 5. Proposed repo structure

```
/
├── README.md
├── docs/
│   ├── concept.md            # full idea, pitch, learning science
│   └── data-model.md         # Game, Chapter, AlexBrain, Attempt, Badge
├── apps/web/                 # frontend
│   └── src/
│       ├── pages/home
│       ├── pages/profile
│       ├── pages/time-travel
│       ├── pages/teaching-room
│       └── pages/assessment-room
├── services/
│   ├── ingest/               # upload + parse course materials
│   ├── chapters/             # generate eras/chapters (time-travel)
│   ├── alex/                 # Alex agent + AlexBrain
│   └── assessment/           # tasks, simulation, grading
├── prompts/                  # versioned system prompts (Alex, mentor, validator)
└── tests/
```

---

## 6. Ownership

| Area | Owner |
|---|---|
| Home, upload flow, profile | TBD |
| Time-travel | Me |
| Teaching room | Friend |
| Assessment room | Friend |
| Shared data model (`AlexBrain` etc.) | Both |

---

## 7. MVP scope (Level 2 prototype)

Build **one chapter end to end** before anything else:

- [ ] Upload a PCB course PDF → generate one chapter (1930s wiring nightmare)
- [ ] Teaching room: teach Alex, Alex remembers across turns
- [ ] Assessment room: one interactive task where Alex's mistake comes from the student's teaching
- [ ] Guardrails in code: mentor and Alex never give away the answer
- [ ] Profile shows stars / one badge

---

## 8. Roadmap vs. challenge levels

- **Level 1 · Design:** problem, target user (2nd-year electronics students), scenario, success metrics.
- **Level 2 · Build:** the MVP above.
- **Level 3 · Bonus:** multi-agent setup (mentor, Alex, validator, curriculum, history fact-checker, supervisor), lecturer approval + dashboard (human in the loop), evaluation logs.

---

## 9. Open questions

- What exactly happens in the time-travel section vs. the assessment room?
- How is the weekly assessment task chosen from the materials?
- Sketch input: freeform drawing or drag-and-drop circuit canvas?
- Which LLM provider and how do we store API keys?

---

## 10. Getting started

_To be filled in once the repo is scaffolded (install, env vars, run commands)._
