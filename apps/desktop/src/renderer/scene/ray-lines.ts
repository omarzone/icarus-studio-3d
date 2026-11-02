import type { SceneRay } from "@icarus/contracts";
import { createContext } from "react";
import type { Vector3 } from "./coordinates.ts";
import { lerpPosition } from "./pose-track.ts";

type Vec3 = [number, number, number];

// A ray drawn hot once what it hits is closer than this share of its range.
export const NEAR_FRACTION = 0.25;

// A distance sensor as drawn, in MuJoCo axes: from the sensor to what it hits, or to its full range.
export type RayLine = {
  sensor: string;
  label: string;
  from: Vec3;
  to: Vec3;
  hit: boolean;
  near: boolean;
  // What the sensor reads, in words ("3.4 m"); null when nothing is within range.
  value: string | null;
};

const along = ([x, y, z]: Vector3, [dx, dy, dz]: Vector3, length: number): Vec3 => [
  x + dx * length,
  y + dy * length,
  z + dz * length,
];

export function rayLine(ray: SceneRay): RayLine {
  const hit = ray.distance !== null;
  return {
    sensor: ray.sensor,
    label: ray.label,
    from: [ray.origin[0], ray.origin[1], ray.origin[2]],
    to: along(ray.origin, ray.direction, ray.distance ?? ray.range),
    hit,
    near: ray.distance !== null && ray.distance < NEAR_FRACTION * ray.range,
    value: ray.distance === null ? null : `${ray.distance.toFixed(1)} m`,
  };
}

function unit(vector: Vec3): Vec3 {
  const length = Math.hypot(...vector);
  return length > 1e-9 ? [vector[0] / length, vector[1] / length, vector[2] / length] : vector;
}

// The rays part of the way from one engine frame to the next, matched by sensor; a hit that appears or vanishes
// shows as the newest frame has it, since the engine never measured anything in between.
export function easeRays(from: readonly SceneRay[], to: readonly SceneRay[], t: number): SceneRay[] {
  const previous = new Map(from.map((ray) => [ray.sensor, ray]));
  return to.map((ray) => {
    const start = previous.get(ray.sensor);
    if (!start) {
      return ray;
    }
    const distance =
      start.distance !== null && ray.distance !== null
        ? start.distance + (ray.distance - start.distance) * t
        : ray.distance;
    return {
      ...ray,
      origin: lerpPosition(start.origin, ray.origin, t),
      direction: unit(lerpPosition(start.direction, ray.direction, t)),
      distance,
    };
  });
}

// Views where the agent senses and acts show its rays; editing views show them only when they are about senses.
export function raysShownByDefault(tab: string, senses: boolean): boolean {
  return tab === "play" || tab === "live-training" || senses;
}

// What a view shows of the distance sensors: the rays, their readings, and every training copy's or one.
export type RayView = { shown: boolean; values: boolean; allCopies: boolean };

// The ray options the surrounding viewport asks for; views outside a viewport (and the prototype) draw no rays.
export const RayViewContext = createContext<RayView | null>(null);
