import type { BrainActivations, BrainNetwork } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { isBrainActivations, isBrainNetwork } from "../engine-client/brain-network-checks.ts";
import { checkpointLabel, networkView, neuronState, sampledIndexes } from "./brain-network-views.ts";

const network: BrainNetwork = {
  run_id: "r1",
  step: 25_000,
  inputs: [
    { index: 0, label: "Front distance 1", sensor: "front:ray0" },
    { index: 1, label: "Goal distance", sensor: null },
  ],
  layers: [
    { name: "Layer 1", size: 3, activation: "tanh" },
    { name: "Layer 2", size: 40, activation: "tanh" },
  ],
  outputs: [{ index: 0, label: "Steering", actuator: "steer" }],
};

const activations: BrainActivations = {
  run_id: "r1",
  step: 25_000,
  observation_labels: ["Front distance 1", "Goal distance"],
  observation: [0.9, 0.1],
  layers: [[0.95, -0.5, 0.01], Array.from({ length: 40 }, (_, i) => (i === 0 ? -0.9 : 0))],
  outputs: [0.2],
};

describe("brain network checks", () => {
  it("accept engine answers and refuse malformed ones", () => {
    expect(isBrainNetwork(network)).toBe(true);
    expect(isBrainActivations(activations)).toBe(true);
    expect(isBrainNetwork({ ...network, layers: [{ name: "x" }] })).toBe(false);
    expect(isBrainActivations({ ...activations, layers: [["a"]] })).toBe(false);
  });
});

describe("networkView", () => {
  const view = networkView({ name: "Run 1", network, activations, checkpoints: ["5k", "25k"], checkpoint: "25k" });

  it("draws inputs, every layer and the outputs with their real sizes", () => {
    expect(view.columns.map((column) => column.label)).toEqual([
      "Inputs · 2",
      "Layer 1 · 3",
      "Layer 2 · 40",
      "Outputs · 1",
    ]);
    expect(view.columns[0]?.nodes.map((node) => node.label)).toEqual(["Front distance 1", "Goal distance"]);
    expect(view.columns[3]?.nodes.map((node) => node.label)).toEqual(["Steering"]);
  });

  it("lights neurons by how strongly they fire and caps large layers", () => {
    expect(view.columns[1]?.nodes.map((node) => node.state)).toEqual(["hot", "on", "idle"]);
    expect(view.columns[2]?.nodes).toHaveLength(16);
    expect(view.columns[2]?.nodes[0]?.state).toBe("hot");
  });

  it("links only hot neurons of neighbouring columns", () => {
    expect(view.links).toContainEqual({ column: 0, from: 0, to: 0 });
    expect(view.links).toContainEqual({ column: 1, from: 0, to: 0 });
    expect(view.links.every((link) => link.column < 3)).toBe(true);
  });

  it("summarizes the real shape and parameter count", () => {
    // (2+1)*3 + (3+1)*40 + (40+1)*1
    expect(view.summary).toBe("2 layers · 3, 40 neurons · 210 parameters · step 25k");
    expect(view.name).toBe("Run 1");
    expect(view.checkpoint).toBe("25k");
  });
});

describe("network helpers", () => {
  it("sample indexes evenly and keep small layers whole", () => {
    expect(sampledIndexes(3, 16)).toEqual([0, 1, 2]);
    expect(sampledIndexes(64, 4)).toEqual([0, 21, 42, 63]);
  });

  it("name checkpoints by step and grade activity", () => {
    expect(checkpointLabel(312_000)).toBe("312k");
    expect(neuronState(-0.7)).toBe("hot");
    expect(neuronState(0.4)).toBe("on");
    expect(neuronState(0.1)).toBe("idle");
  });
});
