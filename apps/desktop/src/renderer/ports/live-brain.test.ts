import type { BrainActivations, BrainNetwork, CheckpointInfo, PlayFrame, RunStatus } from "@icarus/contracts";
import { describe, expect, it, vi } from "vitest";
import { followsLive } from "../editor/brain-activity/use-live-brain.ts";
import type { PlayHandlers } from "../engine-client/play-socket.ts";
import { isPlayFrame, isPlayMessageEnvelope } from "../engine-client/response-checks.ts";
import { createEngineBrainActivity } from "./brain-activity-engine.ts";
import { activityView, liveActivations, liveReadingsView } from "./brain-activity-views.ts";
import { createEngineNetwork } from "./brain-network-engine.ts";
import { createLiveBrains, type LiveBrain } from "./live-brain.ts";
import { createEnginePlayPort } from "./play-engine.ts";
import play from "./testdata/play-frame.json";

const network: BrainNetwork = {
  run_id: "r1",
  step: 25_000,
  inputs: [
    { index: 0, label: "Front", sensor: "car:ray0" },
    { index: 1, label: "Goal distance" },
  ],
  layers: [{ name: "Layer 1", size: 4, activation: "tanh" }],
  outputs: [{ index: 0, label: "Throttle", actuator: "car:throttle" }],
};

const snapshot: BrainActivations = {
  run_id: "r1",
  step: 25_000,
  observation_labels: ["Front", "Goal distance"],
  observation: [0, 0],
  layers: [[0, 0, 0, 0]],
  outputs: [0],
};

const live: LiveBrain = {
  runId: "r1",
  step: 25_000,
  brain: "Trained brain: Run 1 at 25,000 steps",
  activity: { time: 2.5, step: 1250, observation: [0.1, 0.9], layers: [[0.9, -0.7, 0.1, 0]], outputs: [0.6] },
  senses: [{ id: "car:ray0", label: "Front", value: 0.5, min: 0, max: 5, unit: "m" }],
  actions: [{ id: "car:throttle", label: "Throttle", value: 0.4, min: 0, max: 1 }],
};

const run: RunStatus = {
  run_id: "r1",
  name: "Run 1",
  project_id: "p1",
  revision_number: 1,
  started_at: "",
  state: "done",
  step: 25_000,
  steps_per_second: 1,
  total_steps: 25_000,
  copies: 1,
  best_step: 25_000,
};

const saved = (step: number): CheckpointInfo => ({ step, episode_return: 1, success_rate: null, has_rollout: true });

function api() {
  return {
    runs: vi.fn(async () => [run]),
    checkpoints: vi.fn(async () => [saved(5_000), saved(25_000)]),
    network: vi.fn(async () => network),
    activations: vi.fn(async () => snapshot),
    readings: vi.fn(async () => ({ run_id: "r1", step: 25_000, seconds: 1, senses: [], actions: [] })),
    behaviors: vi.fn(),
    sources: vi.fn(),
    project: vi.fn(),
    library: vi.fn(),
    applyOperations: vi.fn(),
  };
}

describe("live brain views", () => {
  it("lights the policy's columns by what the playing brain computes now and says it is live", () => {
    const view = activityView(network, liveActivations(live), true);
    expect(view.live).toBe(true);
    expect(view.note).toBe("Live in Play");
    expect(view.regions.map((region) => [region.id, region.active])).toEqual([
      ["inputs", 1],
      ["layer-1", 2],
      ["outputs", 1],
    ]);
    expect(activityView(network, snapshot).note).toBe("First moment of a test try");
  });

  it("reads the senses and picks of the playing brain with how far into Play they are", () => {
    const view = liveReadingsView(live);
    expect(view.rows).toEqual([{ label: "Front", value: "0.5 m", ratio: 0.1, hot: true }]);
    expect(view.caption).toBe("Live in Play, 2.5 s in, Trained brain: Run 1 at 25,000 steps picks: Throttle 0.4");
  });

  it("follows Play while it runs, asks for the network once, and falls back to the evaluation when it stops", async () => {
    const brains = createLiveBrains();
    const fake = api();
    const port = createEngineBrainActivity(fake, brains);
    brains.publish("p1", live);
    expect((await port.getActivity("p1")).live).toBe(true);
    brains.publish("p1", { ...live, activity: { ...live.activity, layers: [[0, 0, 0, 0]] } });
    const later = await port.getActivity("p1");
    expect(later.regions[1]?.active).toBe(0);
    expect((await port.getReadings("p1")).caption).toContain("Live in Play");
    expect(fake.network).toHaveBeenCalledTimes(1);
    expect(fake.activations).not.toHaveBeenCalled();
    expect(fake.readings).not.toHaveBeenCalled();
    brains.clear("p1");
    expect(await port.getActivity("p1")).toMatchObject({ live: false, note: "First moment of a test try" });
    expect((await port.getReadings("p1")).caption).toContain("1 s into a test try");
  });

  it("offers Live in the network and shows a saved checkpoint when one is picked", async () => {
    const brains = createLiveBrains();
    const fake = api();
    const port = createEngineNetwork(fake, brains);
    const idle = await port.getNetwork({ brain: "p1" });
    expect(idle.checkpoints).toEqual(["Live", "5k", "25k"]);
    expect(idle.checkpoint).toBe("25k");
    expect(idle.summary).toMatch(/first moment of a test try$/);
    brains.publish("p1", live);
    const shown = await port.getNetwork({ brain: "p1", checkpoint: "Live" });
    expect(shown.checkpoint).toBe("Live");
    expect(shown.name).toBe("Run 1");
    expect(shown.summary).toMatch(/live in Play$/);
    expect(shown.columns[1]?.nodes.map((node) => node.state)).toEqual(["hot", "hot", "idle", "idle"]);
    expect((await port.getNetwork({ brain: "p1", checkpoint: "5k" })).checkpoint).toBe("5k");
  });

  it("re-reads only the views that follow the playing brain", () => {
    expect(followsLive(["brain", "p1", "activity"], "p1")).toBe(true);
    expect(followsLive(["brain", "p1", "network", null], "p1")).toBe(true);
    expect(followsLive(["brain", "p1", "network", "Live"], "p1")).toBe(true);
    expect(followsLive(["brain", "p1", "network", "5k"], "p1")).toBe(false);
    expect(followsLive(["brain", "p1", "learning"], "p1")).toBe(false);
    expect(followsLive(["brain", "p2", "activity"], "p1")).toBe(false);
  });
});

describe("play stream to the live brain", () => {
  const [ready, framed] = [play.ready, play.frame].map((envelope) =>
    isPlayMessageEnvelope(envelope) ? envelope.message : null,
  );
  if (ready?.type !== "ready" || framed?.type !== "frame" || !isPlayFrame(framed.frame)) {
    throw new Error("bad test data");
  }
  const frame: PlayFrame = framed.frame;

  it("publishes a trained brain's activity with the frame's readings and forgets it when Play ends", () => {
    let handlers: PlayHandlers | undefined;
    const open = vi.fn((_project: string, given: PlayHandlers) => {
      handlers = given;
      return { send: () => undefined, close: () => undefined };
    });
    const brains = createLiveBrains();
    const changes = vi.fn();
    brains.subscribe("p", changes);
    const pacing = { nextPaint: () => undefined, now: () => 0 };
    const listener = { onUpdate: () => undefined, onClosed: () => undefined, onError: () => undefined };
    const disconnect = createEnginePlayPort(open, undefined, pacing, brains).connect("p", listener);
    handlers?.onReady({ ...ready.session, run_id: "r1", step: 25_000, activity: true });
    handlers?.onFrame(frame);
    handlers?.onActivity?.(live.activity);
    expect(brains.current("p")).toMatchObject({ runId: "r1", step: 25_000, senses: frame.senses });
    expect(brains.current("p")?.activity).toEqual(live.activity);
    disconnect();
    expect(brains.current("p")).toBeNull();
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it("checks activity messages before routing them", () => {
    const message = { type: "activity", activity: live.activity };
    expect(isPlayMessageEnvelope({ message })).toBe(true);
    expect(isPlayMessageEnvelope({ message: { ...message, activity: { ...live.activity, layers: [["x"]] } } })).toBe(
      false,
    );
  });
});
