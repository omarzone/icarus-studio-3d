import type { EngineEvent, TaskInfo } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { status } from "../../ports/testdata/training-runs.ts";
import { eventInvalidations, nextLiveSteps, withTaskProgress } from "./engine-event-effects.ts";

const step = (summary: string): EngineEvent => ({ type: "step", turn_id: "t1", step: { tool: "inspect", summary } });

describe("eventInvalidations", () => {
  it("re-reads the project document, its revisions and thumbnails after a new revision", () => {
    const keys = eventInvalidations({ type: "revision_created", revision: 4, author: "copilot", summary: "" }, "p1");
    expect(keys).toEqual(
      expect.arrayContaining([["scene", "p1"], ["projects"], ["revisions"], ["scene-thumbnail"], ["copilot-preview"]]),
    );
  });

  it("re-reads conversations when a proposal is created and the project as well once it is applied", () => {
    expect(eventInvalidations({ type: "proposal_created", proposal_id: "x", summary: "" }, "p1")).toEqual([
      ["copilot"],
      ["copilot-preview"],
    ]);
    const applied = eventInvalidations({ type: "proposal_applied", proposal_id: "x", revision: 5 }, "p1");
    expect(applied).toEqual(expect.arrayContaining([["copilot"], ["scene", "p1"], ["revisions"]]));
  });

  it("re-reads training, results and the task list when a task finishes", () => {
    const keys = eventInvalidations({ type: "task_finished", task_id: "k1", state: "done" }, "p1");
    expect(keys).toEqual(
      expect.arrayContaining([
        ["training", "p1"],
        ["results", "p1"],
        ["tasks", "p1"],
      ]),
    );
  });

  it("re-reads results after a diagnosis and the task list when a task starts", () => {
    expect(eventInvalidations({ type: "diagnosis_created", diagnosis_id: "d", run_id: "r" }, "p1")).toEqual([
      ["results", "p1"],
    ]);
    const task: TaskInfo = {
      id: "k1",
      project_id: "p1",
      kind: "diagnosis",
      state: "running",
      title: "Diagnose",
      started_at: "2026-11-01T10:00:00Z",
    };
    expect(eventInvalidations({ type: "task_started", task }, "p1")).toEqual([["tasks", "p1"]]);
  });

  it("re-reads the conversation when the copilot posts a message on its own", () => {
    expect(eventInvalidations({ type: "message_posted", message_id: "m1", role: "copilot" }, "p1")).toEqual([
      ["copilot", "p1"],
    ]);
  });

  it("re-reads the run list when a run's state changes, so a run started from the chat shows up", () => {
    const changed: EngineEvent = {
      type: "run_event",
      run_id: "r2",
      event: { type: "status", status: status({ run_id: "r2" }) },
    };
    expect(eventInvalidations(changed, "p1")).toEqual([["training", "p1", "runs"]]);
    const logged: EngineEvent = {
      type: "run_event",
      run_id: "r2",
      event: { type: "log", line: { elapsed: 1, level: "info", text: "" } },
    };
    expect(eventInvalidations(logged, "p1")).toEqual([]);
  });

  it("leaves queries alone for live-only events", () => {
    expect(eventInvalidations(step("Read"), "p1")).toEqual([]);
    expect(eventInvalidations({ type: "task_progress", task_id: "k", progress: 0.2, text: "" }, "p1")).toEqual([]);
  });
});

describe("nextLiveSteps", () => {
  it("starts empty with a turn, collects its steps and clears when it finishes", () => {
    let steps = nextLiveSteps([{ tool: "look", summary: "old" }], { type: "turn_started", turn_id: "t1" });
    expect(steps).toEqual([]);
    steps = nextLiveSteps(steps, step("Read the world"));
    steps = nextLiveSteps(steps, step("Tried taller walls"));
    expect(steps.map((entry) => entry.summary)).toEqual(["Read the world", "Tried taller walls"]);
    expect(nextLiveSteps(steps, { type: "diagnosis_created", diagnosis_id: "d", run_id: "r" })).toBe(steps);
    expect(nextLiveSteps(steps, { type: "turn_finished", turn_id: "t1" })).toEqual([]);
  });
});

describe("withTaskProgress", () => {
  const running: TaskInfo = {
    id: "k1",
    project_id: "p1",
    kind: "training_run",
    state: "running",
    progress: 0.1,
    title: "Run 3",
    started_at: "2026-11-01T10:00:00Z",
  };

  it("moves the progress of the matching task only", () => {
    const other = { ...running, id: "k2" };
    const next = withTaskProgress([running, other], { type: "task_progress", task_id: "k1", progress: 0.6, text: "" });
    expect(next?.map((task) => task.progress)).toEqual([0.6, 0.1]);
  });

  it("keeps an unread list unread", () => {
    expect(withTaskProgress(undefined, { type: "task_progress", task_id: "k1", progress: 0.6, text: "" })).toBe(
      undefined,
    );
  });
});
