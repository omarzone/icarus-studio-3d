import type {
  BrainActivations,
  BrainNetwork,
  BrainReadings,
  BrainSources,
  CheckpointInfo,
  RunStatus,
} from "@icarus/contracts";
import { describe, expect, it, vi } from "vitest";
import { createEngineBrainActivity } from "./brain-activity-engine.ts";
import {
  activityView,
  behaviorsView,
  NO_READINGS,
  readingsView,
  sourceOperation,
  sourceView,
  wiringView,
} from "./brain-activity-views.ts";

const checkpoint = { runId: "r1", runName: "Run 3", step: 250_000 };

const readings: BrainReadings = {
  run_id: "r1",
  step: 250_000,
  seconds: 1,
  senses: [
    { id: "car:ray0", label: "Front", value: 0.5, min: 0, max: 5, unit: "m" },
    { id: "car:speed", label: "Car speed", value: 1.25, min: -10, max: 10, unit: "m/s" },
  ],
  actions: [
    { id: "car:throttle", label: "Throttle", value: 0.4, min: 0, max: 1 },
    { id: "car:steering", label: "Steering", value: -0.25, min: -1, max: 1 },
  ],
};

const network: BrainNetwork = {
  run_id: "r1",
  step: 250_000,
  inputs: [
    { index: 0, label: "Front", sensor: "car:ray0" },
    { index: 1, label: "Goal distance" },
  ],
  layers: [{ name: "Layer 1", size: 4, activation: "tanh" }],
  outputs: [{ index: 0, label: "Throttle", actuator: "car:throttle" }],
};

const activations: BrainActivations = {
  run_id: "r1",
  step: 250_000,
  observation_labels: ["Front", "Goal distance"],
  observation: [0.1, 0.9],
  layers: [[0.9, -0.7, 0.1, 0]],
  outputs: [0.6],
};

describe("brain readings and activity", () => {
  it("shows what the checkpoint senses one second into a test try and what it picks", () => {
    const view = readingsView(readings, checkpoint);
    expect(view.rows).toEqual([
      { label: "Front", value: "0.5 m", ratio: 0.1, hot: true },
      { label: "Car speed", value: "1.25 m/s", ratio: 0.5625, hot: false },
    ]);
    expect(view.caption).toBe("1 s into a test try, Run 3 at 250k steps picks: Throttle 0.4, Steering -0.25");
  });

  it("lights each column of the policy by the neurons that compute far from zero", () => {
    const regions = activityView(network, activations).regions;
    expect(regions.map((region) => [region.id, region.neurons, region.active])).toEqual([
      ["inputs", 2, 1],
      ["layer-1", 4, 2],
      ["outputs", 1, 1],
    ]);
    expect(regions[1]?.detail).toBe("Hidden layer, tanh · 2 of 4 active");
  });

  it("lists how the test tries ended with when it happened", () => {
    const behaviors = behaviorsView({
      run_id: "r1",
      step: 250_000,
      behaviors: [
        { id: "reached_goal", name: "Reached the goal", detail: "2 of 3", episodes: 2, of: 3, seconds: 72.4 },
        { id: "timed_out_far", name: "Time ran out", detail: "1 of 3", episodes: 1, of: 3, seconds: null },
      ],
    });
    expect(behaviors.map((behavior) => [behavior.name, behavior.when])).toEqual([
      ["Reached the goal", "1:12"],
      ["Time ran out", ""],
    ]);
  });

  it("counts senses and motors turned off in the wiring, and a vehicle's actions when it has no motors", () => {
    expect(wiringView({ total: 4, muted: 1 }, { total: 2, muted: 0 }, 2).maps).toEqual([
      {
        id: "senses",
        name: "Senses map",
        matched: "75%",
        detail: "3 of 4 sensors feed the brain; 1 turned off read as zero",
      },
      { id: "motor", name: "Motor map", matched: "100%", detail: "The brain drives 2 of 2 motors" },
    ]);
    expect(wiringView({ total: 0, muted: 0 }, { total: 0, muted: 0 }, 3).maps[0]?.detail).toContain("3 actions");
  });
});

describe("brain sources", () => {
  const sources: BrainSources = {
    project_id: "p1",
    senses: 24,
    motors: 3,
    selected: { run_id: "r9", step: 50_000 },
    options: [
      {
        run_id: "r9",
        step: 50_000,
        project_id: "p2",
        project_name: "Other car",
        run_name: "Run 1",
        success_rate: 0.5,
        fits: true,
      },
      {
        run_id: "r8",
        step: 5_000,
        project_id: "p3",
        project_name: "Walker",
        run_name: "Run 2",
        fits: false,
        reason: "The body changed: 30 senses now, 24 then",
      },
    ],
  };

  it("offers learning from zero and every trained brain that fits, saying why the others do not", () => {
    const view = sourceView(sources);
    expect(view.options.map((option) => option.id)).toEqual(["learn", "r9@50000"]);
    expect(view.options[1]?.detail).toBe("Its best brain, at 50k steps · 50% success");
    expect(view.selected).toBe("r9@50000");
    expect(view.connections.at(-1)).toEqual({
      text: "1 trained brain does not fit this body: The body changed: 30 senses now, 24 then",
      tone: "warn",
    });
  });

  it("loads a brain by pointing the project's brain at it, or back to zero", () => {
    expect(sourceOperation("run-2026@5000")).toEqual({
      op: "set_brain",
      start_from: { run_id: "run-2026", step: 5000 },
    });
    expect(sourceOperation("learn")).toEqual({ op: "set_brain", start_from: "none" });
    expect(() => sourceOperation("nonsense")).toThrow("Choose a brain");
  });

  it("reads nothing before any brain was trained, and the newest run's best checkpoint after", async () => {
    const run = (id: string, best: number | null): RunStatus => ({
      run_id: id,
      name: `Run ${id}`,
      project_id: "p1",
      revision_number: 1,
      started_at: "",
      state: "done",
      step: 1,
      steps_per_second: 1,
      total_steps: 1,
      copies: 1,
      best_step: best,
    });
    const saved = (step: number): CheckpointInfo => ({
      step,
      episode_return: 1,
      success_rate: null,
      has_rollout: true,
    });
    const api = {
      runs: vi.fn(async () => [run("new", null), run("old", 25_000)]),
      checkpoints: vi.fn(async (id: string) => (id === "new" ? [] : [saved(0), saved(25_000)])),
      readings: vi.fn(async () => readings),
      network: vi.fn(async () => network),
      activations: vi.fn(async () => activations),
      behaviors: vi.fn(async () => ({ run_id: "old", step: 25_000, behaviors: [] })),
      sources: vi.fn(async () => sources),
      project: vi.fn(),
      library: vi.fn(),
      applyOperations: vi.fn(),
    };
    const port = createEngineBrainActivity(api);
    expect((await port.getReadings("p1")).caption).toContain("Run old at 25k steps");
    expect(api.readings).toHaveBeenCalledWith("old", 25_000);
    api.runs.mockResolvedValue([]);
    expect(await port.getReadings("p1")).toBe(NO_READINGS);
    expect(await port.getActivity("p1")).toEqual({ live: false, regions: [] });
  });
});
