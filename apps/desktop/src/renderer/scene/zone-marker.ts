import type { SceneZone } from "@icarus/contracts";
import { toThreePosition } from "./coordinates.ts";

// Markers sit just above the ground so they read as painted on it, never inside the floor.
const GROUND_LIFT = 0.01;
const SPAWN_RING_RADIUS = 0.5;

export type ZoneTone = "goal" | "spawn" | "area";

export type ZoneMarker =
  | { kind: "disc"; tone: ZoneTone; position: [number, number, number]; radius: number }
  | { kind: "ring"; tone: ZoneTone; position: [number, number, number]; radius: number }
  | { kind: "box"; tone: ZoneTone; position: [number, number, number]; size: [number, number, number] };

// How a task zone is drawn in Three.js space: goals and spawns on the ground, marked areas where they are.
export function zoneMarker(zone: SceneZone): ZoneMarker {
  const [x, , z] = toThreePosition([zone.position[0], zone.position[1], 0]);
  const onGround: [number, number, number] = [x, GROUND_LIFT, z];
  switch (zone.kind) {
    case "goal_zone":
      return { kind: "disc", tone: "goal", position: onGround, radius: zone.size[0] / 2 };
    case "spawn_point":
      return { kind: "ring", tone: "spawn", position: onGround, radius: SPAWN_RING_RADIUS };
    case "zone":
      return {
        kind: "box",
        tone: "area",
        position: toThreePosition(zone.position),
        size: [zone.size[0], zone.size[2], zone.size[1]],
      };
  }
}
