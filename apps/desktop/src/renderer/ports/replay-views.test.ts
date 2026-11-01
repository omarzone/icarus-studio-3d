import type { Rollout, TrainingSnapshot } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { checkpointMarks, replayFrames, snapshotCopies } from "./replay-views.ts";
import { checkpoint, status } from "./testdata/training-runs.ts";

describe("checkpoint marks", () => {
  it("names every checkpoint with its evaluation and marks the best one", () => {
    const marks = checkpointMarks(status({ best_step: 250_000 }), [
      checkpoint(0, 0),
      { ...checkpoint(250_000, 0.714), has_rollout: true },
      { ...checkpoint(312_000, null, 4.25), has_rollout: false },
    ]);
    expect(marks).toEqual([
      { step: 0, label: "Checkpoint 0", result: "Success 0% · fails 38%", best: false, replayable: true },
      { step: 250_000, label: "Checkpoint 250k", result: "Success 71% · fails 38%", best: true, replayable: true },
      { step: 312_000, label: "Checkpoint 312k", result: "Return 4.3", best: false, replayable: false },
    ]);
  });
});

describe("replay frames", () => {
  it("turns each recorded frame into poses by geom name", () => {
    const rollout: Rollout = {
      step: 250_000,
      seed: 10_000,
      geoms: ["chassis", "wheel"],
      frames: [
        {
          time: 0,
          positions: [
            [0, 0, 0.2],
            [1, 0, 0.1],
          ],
          quaternions: [
            [1, 0, 0, 0],
            [1, 0, 0, 0],
          ],
          reward: 0,
        },
        {
          time: 0.05,
          positions: [
            [0.1, 0, 0.2],
            [1.1, 0, 0.1],
          ],
          quaternions: [
            [1, 0, 0, 0],
            [0, 1, 0, 0],
          ],
          reward: 0.2,
        },
      ],
      episode_return: 12.5,
      outcome: "Reached the parking spot at 12.4 s",
    };
    const frames = replayFrames(rollout);
    expect(frames).toHaveLength(2);
    expect(frames[1]?.time).toBe(0.05);
    expect(frames[1]?.poses.get("wheel")).toEqual({ position: [1.1, 0, 0.1], quaternion: [0, 1, 0, 0] });
  });
});

describe("snapshot copies", () => {
  it("gives each parallel copy its poses by geom name", () => {
    const snapshot: TrainingSnapshot = {
      step: 32_768,
      geoms: ["chassis"],
      copies: [
        { positions: [[0, 0, 0.2]], quaternions: [[1, 0, 0, 0]] },
        { positions: [[5, 1, 0.2]], quaternions: [[0, 0, 0, 1]] },
      ],
    };
    const copies = snapshotCopies(snapshot);
    expect(copies).toHaveLength(2);
    expect(copies[1]?.get("chassis")).toEqual({ position: [5, 1, 0.2], quaternion: [0, 0, 0, 1] });
  });
});
