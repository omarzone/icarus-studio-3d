import type { PlateSignal, SceneAnchor, SceneEyes, ScenePlate } from "@icarus/contracts";
import type { Vector3 } from "./coordinates.ts";
import type { Pose } from "./pose-track.ts";
import { rotate } from "./quaternion.ts";

// How plates, displays and eyes are drawn from the engine's states and poses. Plates light only when the engine
// reports them; eyes blink on their own, a pure animation that nothing in the simulation reads.

// Colors drawn inside the 3D view: a display's dark face and empty bar, a start pad's dark stripes, eye defaults.
export const PANEL = {
  face: "#0b0c0f",
  track: "#24262b",
  digits: "#ff3b30",
  stripe: "#1b1d21",
  white: "#ffffff",
  pupil: "#111111",
} as const;

export type PlateLook = { glow: number; sink: number; stripes: boolean };

// A plate glows and sinks while its trigger holds, keeps a faint glow once reached, and a start pad is striped.
export function plateLook(plate: Pick<ScenePlate, "role" | "sink">, signal: PlateSignal | undefined): PlateLook {
  const stripes = plate.role === "start";
  if (signal?.active) {
    return { glow: 1, sink: plate.sink ?? 0, stripes };
  }
  return { glow: signal?.reached ? 0.3 : 0, sink: 0, stripes };
}

// Where a part is now: its eased engine pose when it has one, otherwise where the scene placed it.
export function anchorPose(anchor: SceneAnchor, live: Pose | null | undefined): Pose {
  return live ?? { position: anchor.position, quaternion: anchor.quaternion };
}

// A point given in the part's own axes, in the world (MuJoCo axes).
export function partPoint(pose: Pose, offset: Vector3): [number, number, number] {
  const [x, y, z] = rotate(pose.quaternion, offset);
  return [pose.position[0] + x, pose.position[1] + y, pose.position[2] + z];
}

// Where a display sits: offset in the part's own axes, or straight from its center in world axes when it turns to
// face the camera, so a bar over a head stays above it while the body tumbles.
export function displayPoint(pose: Pose, offset: Vector3, billboard: boolean): [number, number, number] {
  if (billboard) {
    return [pose.position[0] + offset[0], pose.position[1] + offset[1], pose.position[2] + offset[2]];
  }
  return partPoint(pose, offset);
}

// A glow that lights at once and fades over about a sixth of a second, so a plate a foot taps reads as pressed.
export function easedGlow(previous: number, target: number, seconds: number): number {
  return Math.max(target, previous - seconds * 6);
}

// Turn about the part's up axis by `degrees`, as a wxyz quaternion.
export function headingTurn(degrees: number): [number, number, number, number] {
  const half = (degrees * Math.PI) / 360;
  return [Math.cos(half), 0, 0, Math.sin(half)];
}

// How far in front of the part's center its face is, toward `facing` degrees, for a box of these full extents.
export function faceDepth(size: Vector3, facing: number): number {
  const angle = (facing * Math.PI) / 180;
  return (Math.abs(Math.cos(angle)) * size[0]) / 2 + (Math.abs(Math.sin(angle)) * size[1]) / 2;
}

// Each eye's center in the turned part's axes (x out of the face, y left, z up), right eye first.
export function eyeCenters(eyes: Pick<SceneEyes, "anchor" | "spacing" | "height" | "facing">): Vector3[] {
  const depth = faceDepth(eyes.anchor.size ?? [0, 0, 0], eyes.facing ?? 0);
  const height = eyes.height ?? 0;
  return [
    [depth, -eyes.spacing / 2, height],
    [depth, eyes.spacing / 2, height],
  ];
}

const BLINK_SECONDS = 0.16;

// Deterministic noise from 0 to 1 for a slot of time, so every view of the same eyes blinks alike.
function noise(seed: number, slot: number): number {
  const value = Math.sin(seed * 12.9898 + slot * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function eyeSeed(name: string): number {
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.charCodeAt(0)) % 10007;
  }
  return hash;
}

// How closed the eyes are at `seconds`, 0 open to 1 shut: one quick blink in every interval, moved within it by
// up to `jitter` of the interval.
export function blinkAmount(seconds: number, interval: number, jitter: number, seed: number): number {
  const span = Math.max(BLINK_SECONDS * 2, interval);
  const slot = Math.floor(seconds / span);
  const spread = Math.min(1, Math.max(0, jitter)) * (span - BLINK_SECONDS * 2);
  const start = slot * span + (span - spread) / 2 - BLINK_SECONDS / 2 + noise(seed, slot) * spread;
  const into = seconds - start;
  if (into < 0 || into > BLINK_SECONDS) {
    return 0;
  }
  return 1 - Math.abs((2 * into) / BLINK_SECONDS - 1);
}

// How far the pupils move (left, up) as a share of their reach, to look along `direction` given in the turned
// part's axes; straight ahead or no direction keeps them centered.
export function pupilShift(direction: Vector3): [number, number] {
  const length = Math.hypot(direction[0], direction[1], direction[2]);
  if (length < 1e-6) {
    return [0, 0];
  }
  return [direction[1] / length, direction[2] / length];
}
