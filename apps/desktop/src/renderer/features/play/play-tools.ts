import { PLACED_PIECE, type PlayAction, type PlayLive, type PlayToolId } from "../../ports/play-port.ts";
import type { ScenePick } from "../../scene/scene-view.tsx";

const SPEEDS: readonly string[] = ["0.25×", "0.5×", "1×", "2×", "4×"];

export function nextSpeed(speed: string): string {
  const index = SPEEDS.indexOf(speed);
  return index < 0 ? "1×" : (SPEEDS[(index + 1) % SPEEDS.length] ?? "1×");
}

// What picking a tool does at once, for tools that need no click in the world.
export function instantAction(tool: PlayToolId): PlayAction | null {
  switch (tool) {
    case "light":
    case "wind":
    case "slow":
    case "reset":
    case "shuffle":
      return { tool };
    case "move":
    case "push":
    case "add-object":
    case "touch":
    case "shadow":
    case "scent":
      return null;
  }
}

// Height of an object's first geom right now, so a moved object keeps its height.
function heightOf(object: string, live: PlayLive | null): number {
  const geom = live?.scene?.geoms.find((item) => item.body === object);
  if (!geom) {
    return 0;
  }
  return (live?.poses.get(geom.name) ?? geom).position[2];
}

export type PickResult = { action: PlayAction | null; held: string | null };

// What a click in the Play view does with the selected tool. Move takes two clicks: the object, then where it goes.
export function pickAction(tool: PlayToolId, pick: ScenePick, held: string | null, live: PlayLive | null): PickResult {
  const [x, y, z] = pick.point;
  switch (tool) {
    case "push":
      return { action: pick.object ? { tool, object: pick.object, direction: pick.direction } : null, held: null };
    case "touch":
      return { action: pick.object ? { tool, object: pick.object } : null, held: null };
    case "move":
      if (pick.object) {
        return { action: null, held: pick.object };
      }
      return held
        ? { action: { tool, object: held, to: [x, y, Math.max(z, heightOf(held, live))] }, held: null }
        : { action: null, held: null };
    case "add-object":
      return { action: { tool, piece: PLACED_PIECE.id, at: [x, y, z] }, held: null };
    case "light":
    case "wind":
    case "slow":
    case "reset":
    case "shuffle":
    case "shadow":
    case "scent":
      return { action: null, held };
  }
}
