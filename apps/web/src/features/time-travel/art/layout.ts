import type { Scene, SceneArt } from "@/lib/chapter-pack";
import { LOCATION_DEFAULT_PROPS, PROPS, SKIN_DEFAULT_LOCATION, isLocation, isProp, type Location } from "./catalog";

export const OUTDOOR: Location[] = ["riverside", "street"];

/** Art for a scene: its own plan if present, otherwise a default room for the era skin. */
export function resolveArt(scene: Scene, skin: string): SceneArt {
  if (scene.art && isLocation(scene.art.location)) {
    const props = scene.art.props.filter(isProp);
    return { ...scene.art, props: props.length ? props : LOCATION_DEFAULT_PROPS[scene.art.location as Location] };
  }
  const location = SKIN_DEFAULT_LOCATION[skin] ?? "study";
  const times = ["day", "day", "dusk", "day"];
  return {
    location,
    view: "city",
    time: times[(scene.n - 1) % 4],
    weather: "clear",
    ambient: "none",
    props: LOCATION_DEFAULT_PROPS[location],
    poses: [],
  };
}

export type PlacedProp = { id: string; x: number; y: number; slot: "floor" | "table" | "wall"; onStand: boolean };

const SLOTS = {
  wall: [86, 130, 172].map((x) => ({ x, y: 50 })),
  table: [214, 248, 282].map((x) => ({ x, y: 66 })),
  floor: [28, 70, 112].map((x) => ({ x, y: 102 })),
};

/**
 * Places up to 3 props per slot type. `priority` props (clue hiding places) are placed first,
 * so a hidden clue is never pushed out of the room.
 */
export function layoutProps(art: SceneArt, priority: string[] = []): PlacedProp[] {
  const outdoor = OUTDOOR.includes(art.location as Location);
  const ordered = [...new Set([...priority.filter((p) => art.props.includes(p)), ...art.props])].filter(isProp);
  const used = { wall: 0, table: 0, floor: 0 };
  const placed: PlacedProp[] = [];

  for (const id of ordered) {
    let slot = PROPS[id].slot;
    if (outdoor && slot === "wall") slot = "floor"; // nothing to hang things on outside
    const list = SLOTS[slot];
    if (used[slot] >= list.length) continue;
    const pos = list[used[slot]++];
    // Outside there is no table: table props sit on a crate stand on the ground.
    placed.push({ id, x: pos.x, y: outdoor && slot === "table" ? 88 : pos.y, slot, onStand: outdoor && slot === "table" });
  }
  return placed;
}
