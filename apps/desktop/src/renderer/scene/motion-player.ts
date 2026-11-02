import type { SceneRay } from "@icarus/contracts";
import { lerpPosition, type Pose, type Poses } from "./pose-track.ts";
import { slerp } from "./quaternion.ts";
import { easeRays } from "./ray-lines.ts";

// Plays the frames MuJoCo recorded for each training copy. It only moves between two recorded frames of the same
// episode; past the newest frame it holds the last pose, and a new episode is a cut, never a blend.

// "realtime": 1x sim speed, a moment behind the newest frame. "fast": sped up to keep pace with training.
export type MotionPlayback = "realtime" | "fast";

export type RecordedFrame = { episode: number; time: number; poses: Poses; rays: readonly SceneRay[] };

export type PlayedCopies = { copies: Poses[]; rays: SceneRay[][] };

// What a live view draws at a moment of the render clock (performance.now()), geoms by name.
export type PosePlayer = { at: (now: number) => { poses: Poses; rays: readonly SceneRay[] } };

export type MotionPlayer = {
  readonly mode: MotionPlayback;
  // Each copy's frames since the previous push, oldest first; frames already held are skipped.
  push: (copies: readonly (readonly RecordedFrame[])[], now: number) => void;
  sample: (now: number) => PlayedCopies;
};

type Stored = RecordedFrame & { stream: number; cut: boolean };

type Track = { frames: Stored[]; anchorWall: number; anchorStream: number; rate: number };

// Seconds of stream between the end of one episode and the start of the next.
const CUT_GAP = 0.05;
// Realtime: when the view falls this far behind the newest frame it skips ahead, keeping this much in hand.
const MAX_LAG = 6;
const CATCH_UP_DELAY = 1.5;
// Fast: how many pushes the playhead takes to reach the newest frame, and how quickly its speed changes.
const FAST_PUSHES = 2;
const RATE_SMOOTHING = 0.3;
const MAX_RATE = 60;
// Frames this far behind the playhead are dropped.
const KEEP_BEHIND = 1;

function playhead(track: Track, now: number): number {
  const last = track.frames[track.frames.length - 1];
  if (!last) {
    return 0;
  }
  return Math.min(last.stream, track.anchorStream + (track.rate * (now - track.anchorWall)) / 1000);
}

function append(track: Track, frames: readonly RecordedFrame[]) {
  for (const frame of frames) {
    const last = track.frames[track.frames.length - 1];
    if (last && last.episode === frame.episode && frame.time <= last.time) {
      continue;
    }
    const continues = last !== undefined && last.episode === frame.episode;
    const stream = last ? last.stream + (continues ? frame.time - last.time : CUT_GAP) : 0;
    track.frames.push({ ...frame, stream, cut: !continues });
  }
}

function blend(from: Poses, to: Poses, t: number): Poses {
  const poses = new Map<string, Pose>();
  for (const [name, target] of to) {
    const start = from.get(name) ?? target;
    poses.set(name, {
      position: lerpPosition(start.position, target.position, t),
      quaternion: slerp(start.quaternion, target.quaternion, t),
    });
  }
  return poses;
}

function frameAt(frames: readonly Stored[], at: number): { poses: Poses; rays: SceneRay[] } {
  let index = 0;
  while (index + 1 < frames.length && (frames[index + 1]?.stream ?? Number.POSITIVE_INFINITY) <= at) {
    index += 1;
  }
  const from = frames[index];
  const to = frames[index + 1];
  if (!from) {
    return { poses: new Map(), rays: [] };
  }
  if (!to || to.cut || at <= from.stream) {
    return { poses: from.poses, rays: [...from.rays] };
  }
  const t = (at - from.stream) / (to.stream - from.stream);
  return { poses: blend(from.poses, to.poses, t), rays: easeRays(from.rays, to.rays, t) };
}

export function createMotionPlayer(mode: MotionPlayback): MotionPlayer {
  const tracks: Track[] = [];
  let lastPush: number | null = null;
  let pushInterval = 200;
  return {
    mode,
    push(copies, now) {
      if (lastPush !== null) {
        pushInterval += (Math.min(2000, Math.max(16, now - lastPush)) - pushInterval) * RATE_SMOOTHING;
      }
      lastPush = now;
      copies.forEach((frames, index) => {
        const track = tracks[index] ?? { frames: [], anchorWall: now, anchorStream: 0, rate: 1 };
        tracks[index] = track;
        let at = playhead(track, now);
        append(track, frames);
        const newest = track.frames[track.frames.length - 1]?.stream ?? 0;
        if (mode === "realtime" && newest - at > MAX_LAG) {
          at = newest - CATCH_UP_DELAY;
        }
        if (mode === "fast") {
          const wanted = (newest - at) / ((FAST_PUSHES * pushInterval) / 1000);
          track.rate = Math.min(MAX_RATE, Math.max(0, track.rate + (wanted - track.rate) * RATE_SMOOTHING));
        }
        track.anchorWall = now;
        track.anchorStream = at;
        while ((track.frames[1]?.stream ?? Number.POSITIVE_INFINITY) < at - KEEP_BEHIND) {
          track.frames.shift();
        }
      });
    },
    sample(now) {
      const played = tracks.map((track) => frameAt(track.frames, playhead(track, now)));
      return { copies: played.map((frame) => frame.poses), rays: played.map((frame) => frame.rays) };
    },
  };
}
