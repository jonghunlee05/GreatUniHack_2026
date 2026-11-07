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
