import type { BrainActivations, BrainNetwork, CheckpointInfo, RunStatus } from "@icarus/contracts";
import { describe, expect, it, vi } from "vitest";
import { createEngineNetwork } from "./brain-network-engine.ts";

const run = (id: string, best: number | null): RunStatus => ({
  run_id: id,
  name: `Run ${id}`,
  project_id: "p1",
  revision_number: 1,
  started_at: "",
  state: "done",
  step: 50_000,
  steps_per_second: 1,
  total_steps: 50_000,
  copies: 1,
  best_step: best,
});

const checkpoint = (step: number): CheckpointInfo => ({
  step,
  episode_return: 1,
  success_rate: null,
  has_rollout: true,
});

const network = (step: number): BrainNetwork => ({
  run_id: "b",
  step,
  inputs: [{ index: 0, label: "Goal distance" }],
  layers: [{ name: "Layer 1", size: 2, activation: "tanh" }],
  outputs: [{ index: 0, label: "Steering" }],
});

const activations = (step: number): BrainActivations => ({
  run_id: "b",
  step,
  observation_labels: ["Goal distance"],
  observation: [1],
  layers: [[1, 0]],
  outputs: [0],
});

function api() {
  return {
    runs: vi.fn(async () => [run("a", null), run("b", 25_000)]),
    checkpoints: vi.fn(async (id: string) => (id === "a" ? [] : [checkpoint(5_000), checkpoint(25_000)])),
    network: vi.fn(async (_id: string, step: number) => network(step)),
    activations: vi.fn(async (_id: string, step: number) => activations(step)),
  };
}

describe("engine network", () => {
  it("shows the best checkpoint of the newest run that has checkpoints", async () => {
    const fake = api();
    const view = await createEngineNetwork(fake).getNetwork({ brain: "p1" });
    expect(fake.network).toHaveBeenCalledWith("b", 25_000);
    expect(view.checkpoints).toEqual(["5k", "25k"]);
    expect(view.checkpoint).toBe("25k");
    expect(view.name).toBe("Run b");
  });

  it("switches to the checkpoint chosen by its label", async () => {
    const fake = api();
    const view = await createEngineNetwork(fake).getNetwork({ brain: "p1", checkpoint: "5k" });
    expect(fake.activations).toHaveBeenCalledWith("b", 5_000);
    expect(view.checkpoint).toBe("5k");
  });

  it("is empty when nothing has trained yet", async () => {
    const fake = { ...api(), runs: vi.fn(async () => []) };
    const view = await createEngineNetwork(fake).getNetwork({ brain: "p1" });
    expect(view.columns).toEqual([]);
    expect(fake.network).not.toHaveBeenCalled();
  });
});
