import type { Keypoint } from "@icarus/contracts";
import type { Point, Pose } from "./motion-port.ts";

// Stick figures of the motion workspace in their 60 × 70 box: from tracked keypoints, or from limb angles.

const BOX = { width: 60, height: 70, margin: 6 };

// A tracked frame's keypoints drawn in the 60 × 70 box of the clip's stick figures, scaled like the whole clip.
export type Bounds = { left: number; top: number; scale: number };

export function boundsOf(frames: readonly (readonly Keypoint[])[]): Bounds {
  const points = frames.flat();
  if (points.length === 0) {
    return { left: 0, top: 0, scale: 1 };
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min(
    (BOX.width - 2 * BOX.margin) / Math.max(right - left, 1e-6),
    (BOX.height - 2 * BOX.margin) / Math.max(bottom - top, 1e-6),
  );
  const width = (right - left) * scale;
  return { left: left - (BOX.width - width) / 2 / scale, top: top - BOX.margin / scale, scale };
}

export function keypointPose(keypoints: readonly Keypoint[], bounds: Bounds): Pose {
  const named = new Map(keypoints.map((point) => [point.name, point]));
  const at = (name: Keypoint["name"]): Point | null => {
    const point = named.get(name);
    return point
      ? [Math.round((point.x - bounds.left) * bounds.scale), Math.round((point.y - bounds.top) * bounds.scale)]
      : null;
  };
  const hips = [at("left_hip"), at("right_hip")].filter((point): point is Point => point !== null);
  const hip: Point = hips.length
    ? [
        Math.round(hips.reduce((sum, p) => sum + p[0], 0) / hips.length),
        Math.round(hips.reduce((sum, p) => sum + p[1], 0) / hips.length),
      ]
    : [30, 34];
  const neck = at("neck") ?? [hip[0], hip[1] - 16];
  return {
    head: at("head") ?? [neck[0], neck[1] - 11],
    neck,
    hip,
    hands: [at("left_wrist") ?? neck, at("right_wrist") ?? neck],
    feet: [at("left_ankle") ?? hip, at("right_ankle") ?? hip],
  };
}

const REST: Readonly<Record<string, number>> = {
  torso: Math.PI / 2,
  head: Math.PI / 2,
  left_upper_arm: -Math.PI / 2,
  left_forearm: -Math.PI / 2,
  right_upper_arm: -Math.PI / 2,
  right_forearm: -Math.PI / 2,
  left_thigh: -Math.PI / 2,
  left_shin: -Math.PI / 2,
  right_thigh: -Math.PI / 2,
  right_shin: -Math.PI / 2,
};
const LENGTHS = { torso: 16, head: 11, upper: 11, fore: 10, thigh: 14, shin: 14 };

// Limb angles in the picture (0 forward, up at π/2) drawn as a stick figure; an unknown limb rests.
export function anglePose(segments: readonly string[], row: readonly (number | null)[]): Pose {
  const angle = (segment: string) => row[segments.indexOf(segment)] ?? REST[segment] ?? 0;
  const step = ([x, y]: Point, segment: string, length: number): Point => [
    Math.round(x + length * Math.cos(angle(segment))),
    Math.round(y - length * Math.sin(angle(segment))),
  ];
  const hip: Point = [30, 36];
  const neck = step(hip, "torso", LENGTHS.torso);
  const hand = (side: string) => step(step(neck, `${side}_upper_arm`, LENGTHS.upper), `${side}_forearm`, LENGTHS.fore);
  const foot = (side: string) => step(step(hip, `${side}_thigh`, LENGTHS.thigh), `${side}_shin`, LENGTHS.shin);
  return {
    head: step(neck, "head", LENGTHS.head),
    neck,
    hip,
    hands: [hand("left"), hand("right")],
    feet: [foot("left"), foot("right")],
  };
}
