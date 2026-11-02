import type { CheckpointInfo, Rollout, RunStatus, TrainingSnapshot } from "@icarus/contracts";
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
