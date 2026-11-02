import type { Vector3 } from "./coordinates.ts";
import { slerp } from "./quaternion.ts";

// Poses streamed by the engine (MuJoCo axes, quaternions wxyz), by geom name.
export type Pose = { position: Vector3; quaternion: readonly [number, number, number, number] };
export type Poses = ReadonlyMap<string, Pose>;

// The last two frames and when the newest arrived: rendering moves between them, never past the newest.
export type PoseTrack = { from: Poses; to: Poses; arrivedAt: number; span: number };

const MIN_SPAN_MS = 1000 / 120;
const MAX_SPAN_MS = 250;

export function nextTrack(track: PoseTrack | null, poses: Poses, now: number): PoseTrack {
  if (!track) {
    return { from: poses, to: poses, arrivedAt: now, span: MIN_SPAN_MS };
  }
  const span = Math.min(MAX_SPAN_MS, Math.max(MIN_SPAN_MS, now - track.arrivedAt));
  return { from: track.to, to: poses, arrivedAt: now, span };
}

// How far rendering is from the previous frame to the newest one, from 0 to 1.
export function trackProgress(track: PoseTrack, now: number): number {
  return Math.min(1, Math.max(0, (now - track.arrivedAt) / track.span));
}

export function lerpPosition(from: Vector3, to: Vector3, t: number): [number, number, number] {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
}

// Where one geom is drawn at `now`, eased between the last two frames.
export function poseAt(track: PoseTrack, name: string, now: number): Pose | null {
  const target = track.to.get(name);
  if (!target) {
    return null;
  }
  const start = track.from.get(name) ?? target;
  const t = trackProgress(track, now);
  return {
    position: lerpPosition(start.position, target.position, t),
    quaternion: slerp(start.quaternion, target.quaternion, t),
  };
}
