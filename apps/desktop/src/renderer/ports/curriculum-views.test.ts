import type { Project, RunStatus } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { runCardProgress } from "./copilot-views.ts";
import { activeStage, curriculumView } from "./curriculum-views.ts";
import { runSummary } from "./training-views.ts";

const task: Project["task"] = {
  family: "navigation",
  rewards: [],
  curriculum: [
    {
      name: "Close",
      settings: [{ parameter: "goal_distance", value: 2 }],
      promote: { success_rate: 0.8, episodes: 20 },
    },
    {
      name: "Strict",
      settings: [
        { parameter: "align_within", value: 15 },
        { parameter: "stop_speed", value: 0.2 },
      ],
      promote: { success_rate: 0.5, episodes: 40 },
    },
    { name: "Real", settings: [] },
  ],
};

function run(update: Partial<RunStatus>): RunStatus {
  return {
    run_id: "r1",
    project_id: "p1",
    revision_number: 3,
    name: "Run 3",
    state: "running",
    step: 5_000,
    total_steps: 10_000,
    copies: 1,
    steps_per_second: 100,
    started_at: "2026-01-01T00:00:00Z",
    ...update,
  };
}

describe("curriculumView", () => {
  it("describes each stage's settings and promotion, marking the stage a run practices", () => {
    expect(curriculumView(task, 1)).toEqual([
      {
        id: "stage-1",
        name: "Close",
        detail: "Starts 2 m from the goal. Next stage at 80% success over the last 20 tries",
        active: false,
      },
      {
        id: "stage-2",
        name: "Strict",
        detail: "Aligned within 15°, stops below 0.2 m/s. Next stage at 50% success over the last 40 tries",
        active: true,
      },
      { id: "stage-3", name: "Real", detail: "The task as it is. Last stage: training stays here", active: false },
    ]);
  });

  it("shows no stages for a task without a curriculum", () => {
    expect(curriculumView({ family: "navigation", rewards: [] })).toEqual([]);
  });
});

describe("activeStage", () => {
  it("reads the stage of a run training the current revision only", () => {
    expect(activeStage([run({ stage: 2 })], 3)).toBe(2);
    expect(activeStage([run({ stage: 2, revision_number: 2 })], 3)).toBeNull();
    expect(activeStage([run({ stage: 1, state: "done" })], 3)).toBeNull();
  });
});

describe("run card goals", () => {
  it("lists the run's stages as passed, practiced now and still ahead", () => {
    const summary = runSummary(run({ stages: ["Close", "Strict", "Real"], stage: 1 }));
    expect(runCardProgress(summary).goals).toEqual([
      { text: "Stage 1: Close", state: "done" },
      { text: "Stage 2: Strict", state: "running" },
      { text: "Stage 3: Real", state: "todo" },
    ]);
  });

  it("practices no stage once the run ended and has no goals without stages", () => {
    const ended = runSummary(run({ state: "stopped", stages: ["Close", "Strict"], stage: 1 }));
    expect(runCardProgress(ended).goals.map((goal) => goal.state)).toEqual(["done", "todo"]);
    expect(runCardProgress(runSummary(run({}))).goals).toEqual([]);
  });
});
