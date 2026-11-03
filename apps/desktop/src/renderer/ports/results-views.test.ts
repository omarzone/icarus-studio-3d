import { describe, expect, it } from "vitest";
import {
  bestBrains,
  bestCheckpoint,
  bestSummary,
  defaultCompared,
  learningHistory,
  type RunRecord,
  resultRuns,
  runComparison,
  scoreSummary,
  toggleCompared,
} from "./results-views.ts";
import { checkpoint, status } from "./testdata/training-runs.ts";

const run3: RunRecord = {
  run: status({ best_step: 250_000 }),
  checkpoints: [checkpoint(100_000, 0.12, 4), checkpoint(250_000, 0.71, 8.4), checkpoint(300_000, 0.6, 9)],
};
const run2: RunRecord = {
  run: status({
    run_id: "run-2",
    name: "Run 2",
    state: "done",
    step: 1_000_000,
    revision_number: 2,
    best_step: 1_000_000,
    started_at: "2026-11-01T09:00:00Z",
  }),
  checkpoints: [checkpoint(250_000, 0.2, 3), checkpoint(1_000_000, 0.44, 6)],
};
const run1: RunRecord = {
  run: status({ run_id: "run-1", name: "Run 1", state: "failed", step: 41_208, started_at: "2026-11-01T08:00:00Z" }),
  checkpoints: [],
};

describe("result runs", () => {
  it("lists runs with their state, steps and best success, the newest as current", () => {
    expect(resultRuns([run3, run2, run1], ["run-2"])).toEqual([
      {
        id: "run-3",
        name: "Run 3",
        detail: "Training · 312k of 1M steps",
        score: "71%",
        compared: false,
        current: true,
      },
      { id: "run-2", name: "Run 2", detail: "Done · 1M steps", score: "44%", compared: true, current: false },
      { id: "run-1", name: "Run 1", detail: "Failed at 41.2k steps", score: "—", compared: false, current: false },
    ]);
  });

  it("scores a task without a goal by its best return", () => {
    const free: RunRecord = { run: status({ best_step: 100 }), checkpoints: [checkpoint(100, null, 12.34)] };
    expect(resultRuns([free], [])[0]?.score).toBe("12.3");
  });

  it("takes the best checkpoint the run named, or ranks by success then return", () => {
    expect(bestCheckpoint(run3)?.step).toBe(250_000);
    const unnamed: RunRecord = { run: status(), checkpoints: [checkpoint(1, 0.5, 1), checkpoint(2, 0.5, 2)] };
    expect(bestCheckpoint(unnamed)?.step).toBe(2);
    expect(bestCheckpoint(run1)).toBeUndefined();
  });

  it("compares the two newest runs with a checkpoint by default and keeps at most two", () => {
    expect(defaultCompared([run3, run1, run2])).toEqual(["run-3", "run-2"]);
    expect(toggleCompared(["run-3", "run-2"], "run-1")).toEqual(["run-2", "run-1"]);
    expect(toggleCompared(["run-3", "run-2"], "run-3")).toEqual(["run-2"]);
  });

  it("offers the best brain of every run that has one", () => {
    expect(bestBrains([run3, run2, run1])).toEqual([
      { id: "run-3", run: "Run 3", checkpoint: "250k", score: "71%" },
      { id: "run-2", run: "Run 2", checkpoint: "1M", score: "44%" },
    ]);
  });
});

describe("summary", () => {
  it("names the best brain over every run", () => {
    expect(bestSummary([run3, run2])).toEqual({
      kind: "best",
      title: "Best brain so far",
      detail: "Run 3 · checkpoint 250k · success 71% · return 8.4",
    });
    expect(bestSummary([run1])).toMatchObject({ kind: "empty" });
  });

  it("draws success and failure bars from a checkpoint's evaluation", () => {
    expect(scoreSummary(run3, undefined)).toEqual({
      kind: "scores",
      title: "Run 3 · checkpoint 250k",
      scores: [
        { label: "Succeeds", value: "71%", ratio: 0.71, tone: "ok" },
        { label: "Fails", value: "38%", ratio: 0.38, tone: "danger" },
      ],
      note: "Return 8.4. Measured on fixed evaluation seeds, apart from the training episodes.",
    });
    expect(scoreSummary(run3, 100_000)).toMatchObject({ title: "Run 3 · checkpoint 100k" });
    expect(scoreSummary(run1, undefined)).toMatchObject({ kind: "empty" });
  });
});

describe("learning history", () => {
  it("shows every checkpoint with its success and return, marking the best", () => {
    expect(learningHistory(run3)).toEqual({
      training: true,
      run: "run-3",
      checkpoints: [
        { id: "100000", reached: true, step: "100k", label: "12%", detail: "return 4.0", current: false },
        { id: "250000", reached: true, step: "250k", label: "71%", detail: "return 8.4", current: true },
        { id: "300000", reached: true, step: "300k", label: "60%", detail: "return 9.0", current: false },
      ],
    });
    expect(learningHistory(undefined)).toEqual({ training: false, checkpoints: [] });
  });

  it("keeps a long history readable with the first, last and best checkpoints", () => {
    const many: RunRecord = {
      run: status({ state: "done", best_step: 7 }),
      checkpoints: Array.from({ length: 30 }, (_, index) => checkpoint(index + 1, index === 6 ? 0.9 : 0.1)),
    };
    const steps = learningHistory(many).checkpoints.map((item) => item.id);
    expect(steps.length).toBeLessThanOrEqual(8);
    expect(steps).toEqual(expect.arrayContaining(["1", "7", "30"]));
  });
});

describe("comparison", () => {
  it("puts two runs side by side with a table from their checkpoints", () => {
    const result = runComparison([
      { ...run2, seeds: 10_000 },
      { ...run3, seeds: 10_000 },
    ]);
    expect(result.basis).toBe("Same seeds");
    expect(result.sides.map((side) => side.title)).toEqual(["Run 2 · checkpoint 1M", "Run 3 · checkpoint 250k"]);
    expect(result.sides[1]?.chips).toEqual([
      { text: "success 71%", tone: "ok" },
      { text: "return 8.4", tone: "neutral" },
    ]);
    expect(result.table?.columns).toEqual(["Run 2", "Run 3"]);
    expect(result.table?.rows).toEqual([
      { label: "Best success", values: ["44%", "71%"] },
      { label: "Best return", values: ["6.0", "8.4"] },
      { label: "Best checkpoint", values: ["1M", "250k"] },
      { label: "Steps trained", values: ["1M", "312k"] },
      { label: "Revision", values: ["2", "3"] },
      { label: "At 250k", values: ["20%", "71%"] },
    ]);
  });

  it("says when the evaluation seeds differ or were not recorded", () => {
    expect(
      runComparison([
        { ...run2, seeds: 1 },
        { ...run3, seeds: 2 },
      ]).basis,
    ).toBe("Different seeds");
    expect(
      runComparison([
        { ...run2, seeds: null },
        { ...run3, seeds: 2 },
      ]).basis,
    ).toBe("Seeds not recorded");
  });

  it("asks for two runs before it compares", () => {
    expect(runComparison([{ ...run2, seeds: 1 }])).toEqual({ basis: "Pick two runs", sides: [] });
  });
});
