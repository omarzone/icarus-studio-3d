import type { CheckpointInfo, Rollout, RunStatus, SceneRay, TrainingSnapshot } from "@icarus/contracts";
import type { RecordedFrame } from "../scene/motion-player.ts";
import { compactNumber } from "../ui/compact-number.ts";
import type { CheckpointMark, CopyPose, CopyPoses, ReplayFrame } from "./training-port.ts";
import { checkpointResult } from "./training-views.ts";

// Pure mappings from checkpoints, rollouts and live snapshots onto what the replay and live views draw.

export function checkpointMarks(run: RunStatus, checkpoints: readonly CheckpointInfo[]): CheckpointMark[] {
  return checkpoints.map((checkpoint) => ({
    step: checkpoint.step,
    label: `Checkpoint ${compactNumber(checkpoint.step)}`,
    result: checkpointResult(checkpoint),
    best: checkpoint.step === run.best_step,
    replayable: checkpoint.has_rollout,
  }));
}

function posesOf(
  geoms: readonly string[],
  positions: readonly CopyPose["position"][],
  quaternions: readonly CopyPose["quaternion"][],
): CopyPoses {
  const poses = new Map<string, CopyPose>();
  geoms.forEach((name, index) => {
    const position = positions[index];
    const quaternion = quaternions[index];
    if (position && quaternion) {
      poses.set(name, { position, quaternion });
    }
  });
  return poses;
}

export function replayFrames(rollout: Rollout): ReplayFrame[] {
  return rollout.frames.map((frame) => ({
    time: frame.time,
    poses: posesOf(rollout.geoms, frame.positions, frame.quaternions),
  }));
}

export function snapshotCopies(snapshot: TrainingSnapshot): CopyPoses[] {
  return snapshot.copies.map((copy) => posesOf(snapshot.geoms, copy.positions, copy.quaternions));
}

// Each copy's distance sensors, in the order of the copies.
export function snapshotRays(snapshot: TrainingSnapshot): SceneRay[][] {
  return snapshot.copies.map((copy) => copy.rays ?? []);
}

// Each copy's recorded frames in the snapshot, or null for a snapshot with one pose per copy (classic).
export function snapshotMotion(snapshot: TrainingSnapshot): RecordedFrame[][] | null {
  if (!snapshot.motion || snapshot.live_view === "classic") {
    return null;
  }
  return snapshot.motion.map((segments) =>
    segments.flatMap((segment) =>
      segment.frames.flatMap((frame, index) => {
        const time = segment.times[index];
        return time === undefined
          ? []
          : [
              {
                episode: segment.episode,
                time,
                poses: posesOf(snapshot.geoms, frame.positions, frame.quaternions),
                rays: frame.rays ?? [],
              },
            ];
      }),
    ),
  );
}
