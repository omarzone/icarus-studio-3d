import type { BehaviorTest, BehaviorTestResult, EpisodeActivations } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import {
  judgedCheckpoints,
  neuronLayers,
  referenceSummary,
  referenceTestsView,
  scaledPaths,
  timelapseView,
} from "./behavior-views.ts";
import type { RunRecord } from "./results-views.ts";
import { checkpoint, status } from "./testdata/training-runs.ts";

const newest: RunRecord = {
  run: status({ best_step: 50_000 }),
  checkpoints: [checkpoint(0, 0), checkpoint(25_000, 0.2), checkpoint(50_000, 0.7)],
};
const older: RunRecord = {
  run: status({ run_id: "run-2", name: "Run 2", best_step: 10_000, started_at: "2026-11-01T09:00:00Z" }),
  checkpoints: [checkpoint(10_000, 0.4)],
};

const test: BehaviorTest = { id: "standard-starts", name: "Standard starts", starts: [20_000, 20_001], shifts: [] };

function result(run: string, step: number, passed: boolean, judged: BehaviorTest = test): BehaviorTestResult {
  return {
    test: judged,
    run_id: run,
    step,
    ran_at: "2026-11-02T10:00:00Z",
    passed,
    has_goal: true,
    path_interval: 0.25,
    passed_share: passed ? 1 : 0,
    fall_share: 0,
    mean_seconds: 4,
    mean_return: 1,
    mean_path_length: 3,
    mean_displacement: 2,
    episodes: [],
  };
}

describe("behavior tests on the Results views", () => {
  it("judges the compared runs' best checkpoints, else the untrained brain against the best", () => {
    expect(judgedCheckpoints([newest, older], ["run-3", "run-2"]).map((side) => side.label)).toEqual([
      "Run 2 · 10k",
      "Run 3 · 50k",
    ]);
    expect(judgedCheckpoints([newest], ["run-3"]).map((side) => side.step)).toEqual([0, 50_000]);
    expect(judgedCheckpoints([], [])).toEqual([]);
  });

  it("reads a test as not run once its definition changed since the stored result", () => {
    const sides = judgedCheckpoints([newest], ["run-3"]);
    const passed = referenceTestsView([test], [result("run-3", 50_000, true)], sides, undefined);
    expect(passed.tests[0]?.state).toBe("pass");
    const moved = { ...test, starts: [20_100] };
    const stale = referenceTestsView([moved], [result("run-3", 50_000, true)], sides, undefined);
    expect(stale.tests[0]?.state).toBe("not-run");
    expect(referenceTestsView([test], [result("run-3", 50_000, false)], sides, "standard-starts").tests[0]?.state).toBe(
      "warn",
    );
  });

  it("sums up the tests that ran and names the next one", () => {
    const summary = referenceSummary({
      selected: "a",
      tests: [
        { id: "a", name: "A", short: "A", state: "pass" },
        { id: "b", name: "B", short: "B", state: "warn" },
        { id: "c", name: "C", short: "C", state: "not-run" },
      ],
    });
    expect(summary).toMatchObject({ kind: "match", value: "1 of 2", nextTest: "Next: C" });
  });

  it("puts both sides' paths on one scale, keeping the shape and flipping ground y to point up", () => {
    const [first, second] = scaledPaths([
      [
        [
          [0, 0],
          [10, 0],
        ],
      ],
      [
        [
          [0, 0],
          [0, 5],
        ],
      ],
    ]);
    expect(first?.[0]).toEqual([
      [6, 72],
      [94, 72],
    ]);
    expect(second?.[0]?.[1]).toEqual([6, 28]);
  });

  it("plays the chosen run's recorded checkpoints, opening on the best", () => {
    const view = timelapseView([newest, older], undefined);
    expect(view.run).toBe("run-3");
    expect(view.frames.map((frame) => frame.step)).toEqual([0, 25_000, 50_000]);
    expect(view.current).toBe("run-3:50000");
    expect(timelapseView([newest, older], "run-2:10000")).toMatchObject({ run: "run-2", current: "run-2:10000" });
    expect(timelapseView([], undefined)).toMatchObject({ run: null, frames: [] });
  });

  it("lists each layer's most active neurons first and says when the replay differs from the recording", () => {
    const activations: EpisodeActivations = {
      run_id: "run-3",
      step: 50_000,
      frames: 100,
      seconds: 5,
      outcome: "Time ran out",
      matches_recording: false,
      layers: [
        {
          name: "Layer 1",
          size: 2,
          activation: "tanh",
          neurons: [
            { index: 0, mean: 0.1, peak: 0.3, active_share: 0 },
            { index: 1, mean: 0.8, peak: 1, active_share: 0.9 },
          ],
        },
      ],
    };
    const [layer] = neuronLayers(activations);
    expect(layer?.neurons.map((neuron) => neuron.id)).toEqual(["n2", "n1"]);
    expect(layer?.detail).toContain("1 of 2 active");
    expect(layer?.detail).toContain("differs from the recording");
  });
});
