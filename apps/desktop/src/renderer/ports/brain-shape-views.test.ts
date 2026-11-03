import type { BrainSizes, Project, ProjectState } from "@icarus/contracts";
import { describe, expect, it, vi } from "vitest";
import { isProject } from "../engine-client/response-checks.ts";
import { createEngineBrainShape } from "./brain-shape-engine.ts";
import {
  addLayerOperation,
  decisionsOperation,
  layerOperation,
  ruleOperation,
  shapeView,
  sizeOperation,
  sizesView,
} from "./brain-shape-views.ts";
import parking from "./testdata/parking-car.json";

const project = (() => {
  if (!isProject(parking.project)) {
    throw new Error("bad test data");
  }
  return parking.project;
})();

function stateOf(doc: Project): ProjectState {
  return {
    project: doc,
    revision: {
      number: 2,
      parent: 1,
      author: "user",
      summary: "s",
      operations: [],
      created_at: "",
      restored_from: null,
    },
    report: { ok: true, checks: [], duration_ms: 1 },
    can_undo: true,
    can_redo: false,
  };
}

const sizes: BrainSizes = {
  project_id: "p1",
  senses: 24,
  motors: 3,
  sizes: [
    {
      id: "small",
      label: "Small",
      layers: [64, 64],
      recommended: true,
      current: false,
      trained: { run_id: "r1", run_name: "Run 2", minutes: 12, steps: 100_000, success_rate: 0.8 },
    },
    { id: "large", label: "Large", layers: [512, 512, 512], recommended: false, current: false, trained: null },
  ],
};

describe("brain shape", () => {
  it("shows the layers, the decision rate and the rules that end a try, from the project", () => {
    const tuned: Project = {
      ...project,
      brain: { ...project.brain, layers: [128, 64], decisions_per_second: 10 },
      task: { ...project.task, episode_seconds: 12, end_on_fall: false },
    };
    const shape = shapeView(tuned);
    expect(shape.layers).toEqual([
      { id: "layer-1", neurons: 128, max: 1024 },
      { id: "layer-2", neurons: 64, max: 1024 },
    ]);
    expect(shape.decisionsPerSecond).toEqual({ value: 10, max: 50 });
    expect(shape.hint).toContain("a 12-second try is 120 steps");
    expect(shape.rules.map((rule) => [rule.id, rule.enabled, rule.lockedReason !== undefined])).toEqual([
      ["time-limit", true, true],
      ["fall", false, false],
      ["success", true, false],
    ]);
  });

  it("changes the brain and the task only through set_brain and set_episode, within their limits", () => {
    const layers = [256, 256];
    expect(layerOperation(project, "layer-2", 2000)).toEqual({ op: "set_brain", layers: [layers[0], 1024] });
    expect(addLayerOperation(project)).toEqual({ op: "set_brain", layers: [...layers, layers.at(-1)] });
    const full = { ...project, brain: { ...project.brain, layers: [8, 8, 8, 8] } };
    expect(() => addLayerOperation(full)).toThrow("4 layers");
    expect(decisionsOperation(1)).toEqual({ op: "set_brain", decisions_per_second: 5 });
    expect(ruleOperation(project, "fall")).toEqual({ op: "set_episode", end_on_fall: false });
    expect(ruleOperation(project, "success")).toEqual({ op: "set_episode", end_on_success: false });
    expect(() => ruleOperation(project, "time-limit")).toThrow("ends in time");
  });

  it("sizes say what runs of this project measured, and none for a size never trained", () => {
    const [small, large] = sizesView(sizes).sizes;
    expect(small).toMatchObject({
      shape: "2 layers × 64",
      time: "Trained in about 12 min on this computer",
      expected: "Run 2 reached 80% success",
      recommended: true,
    });
    expect(small?.diagram).toEqual([11, 4, 4, 3]);
    expect(large).toMatchObject({
      time: "Not timed on this computer yet",
      expected: "No run has trained this size yet",
    });
    expect(sizeOperation(sizes, "large")).toEqual({ op: "set_brain", layers: [512, 512, 512] });
  });

  it("choosing a size applies it on the engine and answers the new shape", async () => {
    const api = {
      project: vi.fn(async () => stateOf(project)),
      applyOperations: vi.fn(async () => stateOf({ ...project, brain: { ...project.brain, layers: [64, 64] } })),
      sizes: vi.fn(async () => sizes),
    };
    const port = createEngineBrainShape(api);
    const shape = await port.chooseSize({ brain: "p1", id: "small" });
    expect(api.applyOperations).toHaveBeenCalledWith(
      "p1",
      [{ op: "set_brain", layers: [64, 64] }],
      "Chose the small brain",
    );
    expect(shape.layers.map((layer) => layer.neurons)).toEqual([64, 64]);
  });
});
