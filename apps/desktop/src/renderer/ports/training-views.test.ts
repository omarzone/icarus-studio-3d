import type { LogLine } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { checkpoint, status } from "./testdata/training-runs.ts";
import {
  activeRun,
  consoleLines,
  failureView,
  liveView,
  runList,
  runSummary,
  startPlan,
  startRequest,
  stopSummary,
} from "./training-views.ts";

describe("runs", () => {
  it("shows a training run with its progress and where it is", () => {
    expect(runSummary(status())).toEqual({
      id: "run-3",
      name: "Run 3",
      status: "running",
      progress: 0.312,
      detail: "312k of 1M steps",
    });
    expect(runSummary(status({ success_rate: 0.714 })).detail).toBe("success 71% · 312k of 1M steps");
  });

  it("says when a run is starting or stopping, and counts both as training", () => {
    expect(runSummary(status({ state: "starting", step: 0 }))).toMatchObject({ status: "running", detail: "starting" });
    expect(runSummary(status({ state: "stopping" }))).toMatchObject({ status: "running", detail: "stopping" });
  });

  it("shows a finished run with its result and length, without progress", () => {
    const done = runSummary(status({ state: "done", step: 1_000_000, success_rate: 0.44 }));
    expect(done).toEqual({ id: "run-3", name: "Run 3", status: "done", detail: "success 44% · 1M steps" });
    expect(runSummary(status({ state: "failed", step: 41_208 })).detail).toBe("failed at 41.2k steps");
    expect(runSummary(status({ state: "stopped", step: 400_000 })).detail).toBe("400k steps");
  });

  it("selects the chosen run when it exists, else the newest", () => {
    const runs = [status({ run_id: "b", name: "Run 2" }), status({ run_id: "a", name: "Run 1", state: "done" })];
    expect(runList(runs, "a").selected).toBe("a");
    expect(runList(runs, "gone").selected).toBe("b");
    expect(runList(runs, undefined).runs.map((run) => run.name)).toEqual(["Run 2", "Run 1"]);
    expect(runList([], undefined)).toEqual({ selected: "", runs: [] });
  });

  it("finds the run that is still training", () => {
    const runs = [status({ run_id: "b", state: "stopping" }), status({ run_id: "a", state: "done" })];
    expect(activeRun(runs)?.run_id).toBe("b");
    expect(activeRun([status({ state: "failed" })])).toBeUndefined();
  });
});

describe("start plan", () => {
  const settings = { threads: 10, max_threads: 12 };

  it("starts from the defaults of the task with the cost on this computer", () => {
    expect(startPlan({ runs: 3, family: "navigation", settings, choice: {} })).toEqual({
      run: "run 4",
      intro:
        "Training is practice: the brain tries over and over and keeps what earns rewards. It will practice 1M steps (one step is one moment of practice) in 16 copies of the world at once; more copies finish sooner but use more of your computer. You can keep editing and chatting meanwhile, and Play then uses the best brain it found.",
      steps: 1_000_000,
      copies: 16,
      estimate: "about 8 min",
      threads: "10 of 12 CPU threads",
      coach: true,
    });
  });

  it("says the estimate for walking bodies is rough", () => {
    const plan = startPlan({ runs: 0, family: "locomotion", settings, choice: {} });
    expect(plan).toMatchObject({ run: "run 1", steps: 2_000_000, copies: 16, estimate: "roughly 17 min" });
  });

  it("scales the estimate up when fewer than 16 copies train", () => {
    expect(startPlan({ runs: 0, family: "navigation", settings, choice: { copies: 4 } }).estimate).toBe("about 33 min");
    expect(startPlan({ runs: 0, family: "navigation", settings, choice: { steps: 10_000_000 } }).estimate).toBe(
      "about 1 h 23 min",
    );
    expect(startPlan({ runs: 0, family: "navigation", settings, choice: { steps: 30_000 } }).estimate).toBe(
      "under a minute",
    );
  });

  it("keeps the steps and copies within what the engine accepts", () => {
    const plan = startPlan({ runs: 0, family: "navigation", settings, choice: { steps: 10, copies: 500 } });
    expect(plan).toMatchObject({ steps: 10_000, copies: 64 });
    expect(startRequest(plan)).toEqual({ total_steps: 10_000, copies: 64, coach: true });
  });

  it("leaves the run uncoached when the person turns the copilot coach switch off", () => {
    const plan = startPlan({ runs: 0, family: "navigation", settings, choice: { coach: false } });
    expect(startRequest(plan).coach).toBe(false);
  });
});

describe("live view and console", () => {
  it("names the latest checkpoint and its evaluation over the copies", () => {
    expect(liveView(status(), [checkpoint(0, 0), checkpoint(250_000, 0.714)])).toEqual({
      caption: "Live training · 16 copies",
      checkpoint: "Checkpoint 250k",
      result: "Success 71% · fails 38%",
      speed: "1,840 steps/s",
    });
  });

  it("says when there is no checkpoint yet and uses the return when the task has no goal", () => {
    expect(liveView(status({ state: "done" }), [])).toMatchObject({
      caption: "Run 3 · done",
      checkpoint: "No checkpoint yet",
      result: "The first one is saved at step 0",
    });
    expect(liveView(status(), [checkpoint(25_000, null, 184.24)]).result).toBe("Return 184.2");
  });

  it("fills the episode bar from the latest checkpoint's recorded episode", () => {
    const frame = (time: number) => ({ positions: [], quaternions: [], reward: 0, time });
    const rollout = {
      step: 250_000,
      seed: 0,
      outcome: "success",
      episode_return: 1,
      geoms: [],
      frames: [frame(0.2), frame(1.8)],
    };
    expect(liveView(status(), [checkpoint(250_000, 0.714)], rollout).episode).toEqual({
      at: "0:00.0",
      length: "0:01.6",
      played: 0,
    });
    expect(liveView(status(), [checkpoint(250_000, 0.714)]).episode).toBeUndefined();
  });

  it("writes log lines with the time since the run started", () => {
    const lines: LogLine[] = [
      { elapsed: 2.4, level: "info", text: "Run 3 started" },
      { elapsed: 3725, level: "warn", text: "slow" },
    ];
    expect(consoleLines(lines)).toEqual([
      { time: "0:00:02", text: "Run 3 started", level: "info" },
      { time: "1:02:05", text: "slow", level: "warn" },
    ]);
  });
});

describe("stop and failure", () => {
  it("says where the run is, its best result and what stopping keeps", () => {
    const run = status({ best_step: 250_000 });
    expect(stopSummary(run, [checkpoint(0, 0), checkpoint(250_000, 0.714)])).toEqual({
      run: "run 3",
      intro: "Run 3 is at 312k of 1M steps. Its best brain so far reaches the goal 71% of the time.",
      keeps: [
        "Save a checkpoint at the current step",
        "Keep the best checkpoint (250k)",
        "Keep the metrics and replays",
      ],
    });
  });

  it("explains a stop before the first checkpoint and without a goal", () => {
    expect(stopSummary(status({ step: 4_000 }), []).intro).toBe(
      "Run 3 is at 4k of 1M steps. It has no checkpoint yet.",
    );
    expect(stopSummary(status({ best_step: 0 }), [checkpoint(0, null, -3.5)]).intro).toBe(
      "Run 3 is at 312k of 1M steps. Its best brain so far scores −3.5.",
    );
  });

  it("explains a failed run in plain words and points back to the last good run", () => {
    const failed = status({
      run_id: "run-4",
      name: "Run 4",
      state: "failed",
      step: 41_208,
      failure: { reason: "The physics went unstable.", details: ["worker exit: unstable simulation"] },
    });
    const earlier = [status({ run_id: "run-3", name: "Run 3", state: "done" })];
    expect(failureView(failed, [failed, ...earlier])).toEqual({
      title: "Run 4 stopped at 41.2k steps",
      reason: "The physics went unstable. No checkpoint was saved, so there is no brain to keep.",
      details: ["worker exit: unstable simulation"],
      lastGoodRun: "run 3",
    });
    expect(failureView({ ...failed, failure: null }, [failed]).lastGoodRun).toBe("results");
    expect(failureView({ ...failed, failure: null }, [failed]).reason).toBe(
      "The run stopped without a reason. No checkpoint was saved, so there is no brain to keep.",
    );
  });

  it("promises a kept brain only when the failed run saved a best checkpoint past step 0", () => {
    const failed = status({ state: "failed", failure: { reason: "The worker quit.", details: [] } });
    expect(failureView({ ...failed, best_step: 25_000 }, [failed]).reason).toBe(
      "The worker quit. Its best brain (checkpoint 25k) is kept and can be used in Play.",
    );
    for (const best_step of [0, null, undefined]) {
      expect(failureView({ ...failed, best_step }, [failed]).reason).toBe(
        "The worker quit. No checkpoint was saved, so there is no brain to keep.",
      );
    }
  });
});
