import type { Rollout, RunStatus, SceneDescription, StartRun } from "@icarus/contracts";
import { describe, expect, it, vi } from "vitest";
import { isLibraryCatalog, isProjectState } from "../engine-client/response-checks.ts";
import type { OpenRunEvents, RunEventHandlers } from "../engine-client/run-events.ts";
import parking from "./testdata/parking-car.json";
import { checkpoint, status, trainPoint } from "./testdata/training-runs.ts";
import { createEngineTrainingPort } from "./training-engine.ts";
import type { LiveCopies, TrainingChange, TrainingListener } from "./training-port.ts";

const scene: SceneDescription = { revision: 3, bodies: [], lights: [], geoms: [] };
const frozen = (runId: string): SceneDescription => ({
  revision: runId === "a" ? 1 : 2,
  bodies: [],
  lights: [],
  geoms: [],
});

const { state, catalog } = (() => {
  const document = {
    project: parking.project,
    revision: { number: 3, parent: 2, author: "user", summary: "s", operations: [], created_at: "" },
    report: { ok: true, checks: [], duration_ms: 1 },
    can_undo: true,
    can_redo: false,
  };
  if (!isProjectState(document) || !isLibraryCatalog(parking.catalog)) {
    throw new Error("bad test data");
  }
  return { state: document, catalog: parking.catalog };
})();

const rollout = (step: number): Rollout => ({
  step,
  seed: 10_000,
  geoms: ["chassis"],
  frames: [
    { time: 0.5, positions: [[0, 0, 0.2]], quaternions: [[1, 0, 0, 0]], reward: 0 },
    { time: 4.5, positions: [[2, 0, 0.2]], quaternions: [[1, 0, 0, 0]], reward: 1 },
  ],
  episode_return: 12,
  outcome: "Time ran out",
});

function engine(initial: RunStatus[]) {
  let runs = initial;
  const started: StartRun[] = [];
  const stopped: string[] = [];
  const api = {
    runs: vi.fn(async () => runs),
    startRun: vi.fn(async (_project: string, body: StartRun) => {
      started.push(body);
      const run = status({ run_id: "run-new", name: `Run ${runs.length + 1}`, state: "starting", step: 0 });
      runs = [run, ...runs];
      return run;
    }),
    stopRun: vi.fn(async (runId: string) => {
      stopped.push(runId);
      runs = runs.map((run) => (run.run_id === runId ? { ...run, state: "stopping" as const } : run));
      return runs[0] ?? status();
    }),
    metrics: vi.fn(async () => [trainPoint(16_384, { reward_terms: { reach_goal: 1 } })]),
    checkpoints: vi.fn(async () => [checkpoint(0, 0), checkpoint(25_000, 0.2)]),
    rollout: vi.fn(async (_runId: string, step: number) => rollout(step)),
    project: vi.fn(async () => state),
    library: vi.fn(async () => catalog),
    scene: vi.fn(async () => scene),
    runScene: vi.fn(async (runId: string) => frozen(runId)),
    trainingSettings: vi.fn(async () => ({
      threads: 6,
      max_threads: 8,
      use_graphics_card: false,
      graphics_card: null,
      projects_folder: "projects",
      runs_folder: "runs",
    })),
  };
  return { api, started, stopped };
}

function streams() {
  const opened: { runId: string; handlers: RunEventHandlers; closed: boolean }[] = [];
  const open: OpenRunEvents = (runId, handlers) => {
    const entry = { runId, handlers, closed: false };
    opened.push(entry);
    return { close: () => (entry.closed = true) };
  };
  return { open, opened };
}

function listener() {
  const lives: LiveCopies[] = [];
  const changes: TrainingChange[] = [];
  const calls = {
    onLive: vi.fn<TrainingListener["onLive"]>((live) => lives.push(live)),
    onChange: vi.fn<TrainingListener["onChange"]>((parts) => changes.push(...parts)),
    onFailed: vi.fn<TrainingListener["onFailed"]>(),
  };
  return { calls, lives, changes };
}

describe("training on the engine", () => {
  it("lists the runs and keeps the chosen one selected", async () => {
    const { api } = engine([
      status({ run_id: "b", name: "Run 2" }),
      status({ run_id: "a", name: "Run 1", state: "done" }),
    ]);
    const port = createEngineTrainingPort(api, streams().open);
    expect((await port.listRuns("p")).selected).toBe("b");
    expect((await port.selectRun({ project: "p", id: "a" })).selected).toBe("a");
    const label = catalog.reward_terms.find((term) => term.term === "reach_goal")?.label;
    expect((await port.getMetrics("p")).breakdown.terms[0]?.label).toBe(label);
  });

  it("plans a run from the task defaults and the chosen changes, then starts it and selects it", async () => {
    const { api, started } = engine([]);
    const port = createEngineTrainingPort(api, streams().open);
    expect(await port.getStartPlan("p")).toMatchObject({
      run: "run 1",
      steps: 1_000_000,
      threads: "6 of 8 CPU threads",
    });
    await port.updateStartPlan({ project: "p", steps: 30_000 });
    expect(await port.updateStartPlan({ project: "p", copies: 4 })).toMatchObject({ steps: 30_000, copies: 4 });
    const list = await port.startRun("p");
    expect(started).toEqual([{ total_steps: 30_000, copies: 4, coach: false }]);
    expect(list.selected).toBe("run-new");
    expect(list.runs[0]).toMatchObject({ status: "running", detail: "starting" });
  });

  it("stops the run that is training, whichever run is selected", async () => {
    const { api, stopped } = engine([status({ run_id: "b" }), status({ run_id: "a", state: "done" })]);
    const port = createEngineTrainingPort(api, streams().open);
    await port.selectRun({ project: "p", id: "a" });
    expect((await port.getStopSummary("p")).run).toBe("run 3");
    await port.stopRun("p");
    expect(stopped).toEqual(["b"]);
  });

  it("says plainly when there is nothing to stop and no failure to explain", async () => {
    const port = createEngineTrainingPort(engine([status({ state: "done" })]).api, streams().open);
    await expect(port.getStopSummary("p")).rejects.toThrow("No run is training right now");
    await expect(port.getFailure("p")).rejects.toThrow("No run of this project stopped by itself");
  });

  it("replays a checkpoint's recorded episode in the scene the run trained in, not the edited project", async () => {
    const { api } = engine([status({ run_id: "b" }), status({ run_id: "a", state: "done" })]);
    const port = createEngineTrainingPort(api, streams().open);
    const replay = await port.getReplay({ project: "p", step: 25_000 });
    expect(replay).toMatchObject({ scene: frozen("b"), label: "Checkpoint 25k", outcome: "Time ran out", duration: 4 });
    await port.getReplay({ project: "p", step: 0 });
    await port.selectRun({ project: "p", id: "a" });
    expect((await port.getReplay({ project: "p", step: 0 })).scene).toEqual(frozen("a"));
    expect(api.rollout).toHaveBeenLastCalledWith("a", 0);
    expect(api.runScene.mock.calls).toEqual([["b"], ["a"]]);
    expect(api.scene).not.toHaveBeenCalled();
    expect(replay.frames).toHaveLength(2);
    expect((await port.getCheckpoints("p")).map((mark) => mark.label)).toEqual(["Checkpoint 0", "Checkpoint 25k"]);
  });

  it("streams the selected run: copies from snapshots, log lines to the console, changes to the views", async () => {
    const { api } = engine([status()]);
    const { open, opened } = streams();
    const port = createEngineTrainingPort(api, open);
    const { calls, lives, changes } = listener();
    const stop = port.watch("p", calls);
    expect(lives[0]).toEqual({ kind: "connecting" });
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    const stream = opened[0];
    if (!stream) {
      throw new Error("no stream");
    }
    expect(lives.at(-1)).toMatchObject({ kind: "message", title: "Run 3 is starting" });
    stream.handlers.onSnapshot({
      step: 32_768,
      geoms: ["chassis"],
      copies: [{ positions: [[1, 2, 0.2]], quaternions: [[1, 0, 0, 0]] }],
    });
    await vi.waitFor(() =>
      expect(lives.at(-1)).toMatchObject({ kind: "live", step: "32.8k steps", scene: frozen("run-3") }),
    );
    expect(api.runScene).toHaveBeenCalledWith("run-3");
    expect(api.scene).not.toHaveBeenCalled();
    stream.handlers.onLog({ elapsed: 3, level: "info", text: "checkpoint 0 saved" });
    stream.handlers.onMetric(trainPoint(32_768));
    stream.handlers.onCheckpoint(checkpoint(0, 0));
    expect(changes).toEqual(["console", "metrics", "checkpoints", "live-view"]);
    expect(await port.getConsole("p")).toEqual([{ time: "0:00:03", text: "checkpoint 0 saved", level: "info" }]);
    stream.handlers.onStatus(status({ state: "failed" }));
    expect(calls.onFailed).toHaveBeenCalledTimes(1);
    expect(lives.at(-1)).toMatchObject({
      kind: "live",
      note: "Run 3 failed · Open Replay to watch any of its checkpoints.",
    });
    stop();
    expect(stream.closed).toBe(true);
  });

  it("does not report a failure again when watching a run that had already failed", async () => {
    const { open, opened } = streams();
    const port = createEngineTrainingPort(engine([status({ state: "failed" })]).api, open);
    const { calls, lives } = listener();
    port.watch("p", calls);
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    opened[0]?.handlers.onStatus(status({ state: "failed" }));
    expect(calls.onFailed).not.toHaveBeenCalled();
    expect(lives.at(-1)).toMatchObject({ kind: "message", title: "Run 3 failed" });
  });

  it("says so when the project has no run, and when the stream is lost", async () => {
    const empty = listener();
    createEngineTrainingPort(engine([]).api, streams().open).watch("p", empty.calls);
    await vi.waitFor(() => expect(empty.lives.at(-1)).toMatchObject({ kind: "message", title: "No run yet" }));

    const { open, opened } = streams();
    const lost = listener();
    createEngineTrainingPort(engine([status()]).api, open).watch("p", lost.calls);
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    opened[0]?.handlers.onClosed("The connection to the run was lost");
    expect(lost.lives.at(-1)).toEqual({ kind: "closed", reason: "The connection to the run was lost" });
  });
});
