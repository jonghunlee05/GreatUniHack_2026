# Features

Each section of the app has its own folder. Work inside your own folder so we
don't edit the same files.

| Folder | Section | Owner | Page URL |
|---|---|---|---|
| `new-game/` | Upload + AI game generator | Justin | `/new` (API: `/api/games`) |
| `profile/` | Profile | Justin | `/games/[id]/profile` |
| `time-travel/` | Time-travel | Justin | `/games/[id]/time-travel` |
| `teaching-room/` | Teaching room | Shasha | `/games/[id]/teaching-room` |
| `assessment-room/` | Assessment room | Shasha | `/games/[id]/assessment-room` |

## How a section is wired

```
src/app/games/[id]/teaching-room/page.tsx       ← route: loads the game, nothing else
        ↓ passes `game`
src/features/teaching-room/TeachingRoomSection.tsx  ← the section's UI (start here)
```

- `game` is the generated course: chapters, ILOs, eras and sources. Its shape
  is in `src/lib/game-schema.ts`.
- Put everything for a section inside its folder: components, hooks, helpers,
  types and Claude calls. For example:

  ```
  features/teaching-room/
  ├── TeachingRoomSection.tsx   # entry component used by the route
  ├── components/               # ChatPanel.tsx, AlexAvatar.tsx, ...
  ├── alex.ts                   # server-side Claude calls for Alex
  └── types.ts
  ```

- API routes go under `src/app/api/games/[id]/<section>/route.ts` and call into
  the feature folder.
- System prompts go in the repo-level `prompts/<agent>/` folder, for example
  `prompts/alex/`. The generator's prompt is `prompts/game-generator/skills.md`.

## Shared code (agree before changing)

| Path | What |
|---|---|
| `src/lib/game-schema.ts` | Game / Chapter / ILO types |
| `src/lib/storage.ts` | Load and save games (JSON files in `data/games/`) |
| `src/lib/sections.ts` | The four sections: names, colours, order |
| `src/components/` | UI used by several sections |
| `src/components/pixel/` | Pixel-art kit: `PixelButton`, `PixelPanel`, `SpeechBubble`, `AlexSprite`, `Cartridge`, `Machine`, `StatusLog`, `PixelStar`. Reuse these so every room matches |
| `src/app/globals.css` | Pixel palette (`px-*` colours), fonts (`font-pixel`, VT323 body), `px-frame` border, stepped animations |

`AlexBrain` (what Alex has been taught) connects the teaching room and the
assessment room. When it's defined, put it in `src/lib/`.

## Purple rooms implementation

The web MVP is implemented in `teaching-room/`, `assessment-room/`, and
`purple-shared/`. It uses the generated `Game` contract without changing the
generator or Justin-owned pages.

- State is stored under `teachback:purple:v1:<game-id>` in browser localStorage.
- Knowledge is isolated per chapter and stores levels, exact student evidence,
  missing reasoning, possible misconceptions, confidence, and update turn.
- Assessment decisions are deterministic: Alex reads only his stored brain,
  transmitted evidence, and whether the mentor intervened.
- Report scoring is transparent (30 teaching, 30 independent performance,
  15 transfer, 10 evidence, 15 diagnosis).
- Repair only sets a target and returns to teaching; it never increases mastery.
- Rematch resets the mission with a changed context while retaining Alex's brain.

The standalone Python demo remains at the repository root. The browser version
is the integration target for the Next.js app and needs no Python process.

## Chapter packs (Agent 2) — what the teaching and assessment rooms can read

Agent 2 generates one chapter pack per chapter when the player clicks Generate in Time-travel.
Spec: `prompts/agent2-event-generator.md`. Types: `src/lib/chapter-pack.ts`.

| Data | Read with | Notes |
|---|---|---|
| Chapter pack (concepts, era, **assessment**) | `getPack(gameId, "ch1")` from `src/lib/play-state.ts` | `pack.assessment` = briefing, evidence, Alex's decision + likely mistakes, curveball, scoring |
| Chapter states | `getPlayState(game).chapters` | `locked → available → generating → ready → in_progress → completed` (+ `failed`) |
| Field notes (what Alex should be taught) | `getPlayState(game).fieldNotes["ch1"]` | Saved when the player finishes the era |
| Teaching room unlocked? | `getPlayState(game).teachingUnlocked["ch1"]` | `true` once the era is finished |
| Knowledge debt (written by the assessment room) | `updatePlayState(game, s => { s.knowledgeDebt["ch1"] = [...] })` | Fed into the next chapter's Agent 2 call |
| Stars earned (shown on Profile) | `updatePlayState(game, s => { (s.stars ??= {})["ch1"] = 2 })` | 0–3, written by the assessment room |
| Alex's brain (shown on Profile brain map) | `updatePlayState(game, s => { ((s.alexBrain ??= {})["ch1"] ??= {})["c1"] = { level: 2, misconceptions: [] } })` | Keyed by pack concept id; level 0 not taught → 3 understood. Written by the teaching room |
| Weak spots from time-travel ("time ripple") | `getPlayState(game).ripples?.["ch1"]` | Concept ids the player struggled with in the era. The teaching room can start these as Alex's weak spots |
| Mark chapter passed | `updatePlayState(game, s => setChapterState(s, "ch1", "completed"))` | The assessment room should do this on a pass. The next chapter unlocks automatically |

**Unlock rule:** `UNLOCK_NEXT_ON=era` (default for now) unlocks the next chapter when its era is finished. Set `UNLOCK_NEXT_ON=assessment` for the spec rule (unlock on assessment pass) once the assessment room marks chapters `completed`.

Chapter ids are `ch<week>` (`chapterIdFor(week)`). Mock mode (`AGENT2_MOCK=true` in `.env.local`) returns a sample MATS23801 pack for free.
