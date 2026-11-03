import type { SceneZone } from "@icarus/contracts";
import { toThreePosition } from "./coordinates.ts";

// Markers sit just above the ground so they read as painted on it, never inside the floor.
const GROUND_LIFT = 0.01;
const SPAWN_RING_RADIUS = 0.5;
// The spawn ring's inner edge as a share of its radius, and its opacity: a ring needs more than a filled disc to read.
export const SPAWN_RING_INNER = 0.75;
export const SPAWN_RING_OPACITY = 0.8;
export const DISC_SEGMENTS = 48;
export const RING_SEGMENTS = 32;

// Width of a rectangular spot's painted outline in metres, like a bay line.
export const SPOT_LINE = 0.12;

// A rectangular spot is outlined in `spot` until the engine says its rules hold, then in `goal`.
export type ZoneTone = "goal" | "spawn" | "area" | "spot";

export type ZoneMarker =
  | { kind: "disc"; tone: ZoneTone; position: [number, number, number]; radius: number }
  | { kind: "ring"; tone: ZoneTone; position: [number, number, number]; radius: number }
  | { kind: "box"; tone: ZoneTone; position: [number, number, number]; size: [number, number, number] }
  // Length along the spot's heading and width across it, turned by `yaw` radians about the vertical.
  | { kind: "spot"; tone: ZoneTone; position: [number, number, number]; length: number; width: number; yaw: number };

// The turn about MuJoCo's vertical axis of a zone's wxyz quaternion.
function yawOf([w, x, y, z]: readonly [number, number, number, number]): number {
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
}

// How a task zone is drawn in Three.js space: goals and spawns on the ground, marked areas where they are.
export function zoneMarker(zone: SceneZone): ZoneMarker {
  const [x, , z] = toThreePosition([zone.position[0], zone.position[1], 0]);
  const onGround: [number, number, number] = [x, GROUND_LIFT, z];
  switch (zone.kind) {
    case "goal_zone":
      if (zone.shape === "box") {
        const [length, width] = zone.size;
        return { kind: "spot", tone: "spot", position: onGround, length, width, yaw: yawOf(zone.quaternion) };
      }
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
