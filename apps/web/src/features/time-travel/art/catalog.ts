/**
 * The pixel-art library Agent 2 can choose from. Single source of truth:
 * the validator repairs plans against these lists, and the system prompt
 * includes them (see agent2/generate.ts → artCatalogText()).
 */

export const LOCATIONS = [
  "study",
  "workshop",
  "lab",
  "lecture_hall",
  "riverside",
  "factory",
  "hospital",
  "street",
  "modern_lab",
] as const;

export const VIEWS = ["none", "city", "countryside", "river", "harbour", "chimneys", "night_sky", "campus"] as const;
export const TIMES = ["day", "dusk", "night"] as const;
export const WEATHER = ["clear", "rain", "fog", "snow"] as const;
export const AMBIENT = ["none", "steam", "water", "flicker", "sparks"] as const;
export const POSES = ["stand", "point", "write", "experiment", "think"] as const;

/** where a prop sits in the room */
export type PropSlot = "floor" | "table" | "wall";

export const PROPS: Record<string, { label: string; slot: PropSlot }> = {
  bookshelf: { label: "Bookshelf", slot: "floor" },
  books: { label: "Stack of books", slot: "table" },
  candle: { label: "Candle", slot: "table" },
  oil_lamp: { label: "Oil lamp", slot: "table" },
  gas_lamp: { label: "Gas lamp", slot: "wall" },
  quill_paper: { label: "Quill and paper", slot: "table" },
  notebook: { label: "Notebook", slot: "table" },
  globe: { label: "Globe", slot: "table" },
  clock: { label: "Wall clock", slot: "wall" },
  chalkboard: { label: "Chalkboard", slot: "wall" },
  diagram: { label: "Pinned diagram", slot: "wall" },
  microscope: { label: "Microscope", slot: "table" },
  flask: { label: "Flask", slot: "table" },
  beaker_rack: { label: "Rack of beakers", slot: "table" },
  bunsen: { label: "Bunsen burner", slot: "table" },
  specimen_jars: { label: "Specimen jars", slot: "table" },
  scales: { label: "Balance scales", slot: "table" },
  dye_bottle: { label: "Dye bottle", slot: "table" },
  glass_tube: { label: "Glass tube", slot: "table" },
  pipe_rig: { label: "Pipe rig", slot: "floor" },
  water_tank: { label: "Water tank", slot: "floor" },
  pump: { label: "Hand pump", slot: "floor" },
  valve_wheel: { label: "Valve wheel", slot: "wall" },
  pressure_gauge: { label: "Pressure gauge", slot: "wall" },
  gears: { label: "Gears", slot: "table" },
  toolboard: { label: "Tool board", slot: "wall" },
  anvil: { label: "Anvil", slot: "floor" },
  furnace: { label: "Furnace", slot: "floor" },
  crate: { label: "Crate", slot: "floor" },
  barrel: { label: "Barrel", slot: "floor" },
  steam_engine: { label: "Steam engine", slot: "floor" },
  dissection_table: { label: "Dissection table", slot: "floor" },
  skeleton: { label: "Anatomy skeleton", slot: "floor" },
  telescope: { label: "Telescope", slot: "floor" },
  radio: { label: "Radio set", slot: "table" },
  oscilloscope: { label: "Oscilloscope", slot: "table" },
  computer: { label: "Computer", slot: "table" },
  circuit_board: { label: "Circuit board", slot: "table" },
  plant: { label: "Potted plant", slot: "floor" },
};

export type Location = (typeof LOCATIONS)[number];

const has = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);
export const isLocation = (v: string) => has(LOCATIONS, v);
export const isView = (v: string) => has(VIEWS, v);
export const isTime = (v: string) => has(TIMES, v);
export const isWeather = (v: string) => has(WEATHER, v);
export const isAmbient = (v: string) => has(AMBIENT, v);
export const isPose = (v: string) => has(POSES, v);
export const isProp = (v: string) => v in PROPS;

/** Default room per era skin, used when a scene has no (valid) art plan. */
export const SKIN_DEFAULT_LOCATION: Record<string, Location> = {
  sepia: "study",
  postwar: "workshop",
  chemlab: "lab",
  modern: "modern_lab",
};

export const LOCATION_DEFAULT_PROPS: Record<Location, string[]> = {
  study: ["bookshelf", "books", "candle", "globe"],
  workshop: ["toolboard", "gears", "crate", "anvil"],
  lab: ["beaker_rack", "flask", "bunsen", "diagram"],
  lecture_hall: ["chalkboard", "notebook", "books"],
  riverside: ["barrel", "crate"],
  factory: ["steam_engine", "pressure_gauge", "barrel"],
  hospital: ["dissection_table", "specimen_jars", "skeleton"],
  street: ["barrel", "crate"],
  modern_lab: ["computer", "oscilloscope", "circuit_board", "plant"],
};

/** Compact list of allowed values for the system prompt. */
export function artCatalogText(): string {
  return [
    `location: ${LOCATIONS.join(" | ")}`,
    `view (what is seen through the window or behind an outdoor scene): ${VIEWS.join(" | ")}`,
    `time: ${TIMES.join(" | ")}   weather: ${WEATHER.join(" | ")}   ambient: ${AMBIENT.join(" | ")}`,
    `poses: ${POSES.join(" | ")}`,
    `props (pick 3–5 per scene): ${Object.keys(PROPS).join(", ")}`,
  ].join("\n");
}
