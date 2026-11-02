import { describe, expect, it } from "vitest";
import {
  autopilotProgress,
  autopilotSettings,
  autopilotStart,
  diagnosisView,
  failureReplay,
  failuresView,
  latestDiagnosis,
  limitsWith,
} from "./coach-views.ts";
import { autopilot, diagnosis, group, proposal } from "./testdata/coach.ts";

const url = (id: string) => `http://engine/attachments/${id}/content`;
const source = "Run 3 · checkpoint 250k";

describe("failure groups", () => {
  const groups = [group(), group({ label: "Times out far from the goal", share: 0.2, frame_attachment_ids: [] })];

  it("lists each group with its share of test runs and its first frame", () => {
    expect(failuresView(groups, source, undefined, url)).toEqual({
      total: source,
      selected: "0",
      groups: [
        {
          id: "0",
          title: "Falls forward early",
          count: "46% of test runs",
          frame: "http://engine/attachments/frame-a/content",
        },
        { id: "1", title: "Times out far from the goal", count: "20% of test runs" },
      ],
    });
    expect(failuresView(groups, source, "1", url).selected).toBe("1");
    expect(failuresView(groups, source, "9", url).selected).toBe("0");
  });

  it("shows the selected group's frames and description where it fails", () => {
    expect(failureReplay(groups, "0", source, url)).toMatchObject({
      watched: `Evaluation of ${source}`,
      note: { title: "Falls forward early", detail: "It leans forward and falls in the first second." },
      run: "46% of test runs",
      frames: [
        { id: "frame-a", url: "http://engine/attachments/frame-a/content" },
        { id: "frame-b", url: "http://engine/attachments/frame-b/content" },
      ],
    });
    expect(failureReplay([], undefined, source, url)).toMatchObject({ empty: true, frames: [] });
  });
});

describe("diagnoses", () => {
  it("picks the newest diagnosis", () => {
    const older = diagnosis({ id: "a", created_at: "2026-11-01T09:00:00Z" });
    const newer = diagnosis({ id: "b", created_at: "2026-11-01T11:00:00Z" });
    expect(latestDiagnosis([older, newer])?.id).toBe("b");
    expect(latestDiagnosis([])).toBeUndefined();
  });

  it("shows the summary, hypothesis, next step and the proposal as the conversation has it", () => {
    expect(diagnosisView(diagnosis(), "Run 3", [proposal({ status: "applied" })])).toEqual({
      id: "d-1",
      title: "Run 3 · checkpoint 250k",
      createdAt: "2026-11-01T10:30:00Z",
      summary: "It falls before it learns to step.",
      hypothesis: "The upright reward is too small next to the speed reward.",
      observations: ["Success stays at 0% over the last 3 checkpoints"],
      nextStep: { label: "Stop and fix", tone: "warn" },
      proposal: { id: "prop-1", summary: "Raise the upright reward", status: "applied" },
    });
    expect(diagnosisView(diagnosis({ proposal_id: null, next_step: "done" }), "Run 3", [])).toMatchObject({
      nextStep: { label: "Done", tone: "ok" },
      proposal: null,
    });
    expect(diagnosisView(diagnosis(), "Run 3", []).proposal).toEqual({
      id: "prop-1",
      summary: "The proposed fix",
      status: "open",
    });
  });
});

describe("autopilot", () => {
  const limits = { goal: 0.8, iterations: 4, minutes: 60 };

  it("says what the autopilot is doing and how far it got", () => {
    expect(autopilotProgress(autopilot())).toMatchObject({
      active: true,
      label: "Running",
      tone: "ok",
      chip: "Autopilot · try 2 of 4",
      detail: "Try 2 of 4 · best success 64% · goal 80%",
    });
    expect(autopilotProgress(autopilot({ state: "waiting_approval" }))).toMatchObject({
      active: true,
      label: "Waiting for your approval",
      tone: "warn",
    });
    expect(autopilotProgress(autopilot({ state: "done", best_success: 0.85 }))).toMatchObject({
      active: false,
      label: "Reached the goal",
    });
    expect(autopilotProgress(autopilot({ state: "done", best_success: 0.5 })).label).toBe("Finished without the goal");
    expect(autopilotProgress(autopilot({ state: "failed", best_success: null })).detail).toBe(
      "Try 2 of 4 · no success measured yet · goal 80%",
    );
  });

  it("keeps the last log lines, newest last", () => {
    const log = Array.from({ length: 8 }, (_, index) => ({
      time: `2026-11-01T10:0${index}:00Z`,
      text: `line ${index}`,
    }));
    const lines = autopilotProgress(autopilot({ log })).log;
    expect(lines.map((line) => line.text)).toEqual(["line 3", "line 4", "line 5", "line 6", "line 7"]);
  });

  it("shows the running mode and limits, or the person's choice when nothing runs", () => {
    const running = autopilotSettings(autopilot({ mode: "ask", goal_success: 0.9, max_iterations: 6 }), {
      mode: "fix",
      limits,
    });
    expect(running).toMatchObject({ mode: "ask", limits: { goal: 0.9, iterations: 6, minutes: 60 } });
    expect(running.options.map((option) => option.mode)).toEqual(["off", "ask", "fix"]);
    const idle = autopilotSettings(null, { mode: "fix", limits });
    expect(idle).toMatchObject({ mode: "fix", limits, progress: null });
  });

  it("starts with the chosen mode and limits, never when off", () => {
    expect(autopilotStart({ mode: "ask", limits })).toEqual({
      mode: "ask",
      goal_success: 0.8,
      max_iterations: 4,
      max_minutes: 60,
    });
    expect(() => autopilotStart({ mode: "off", limits })).toThrow(/Ask first or Fix on its own/);
  });

  it("keeps limits inside what the engine accepts", () => {
    expect(limitsWith(limits, { goal: 1.4, iterations: 0.4, minutes: 2 })).toEqual({
      goal: 1,
      iterations: 1,
      minutes: 5,
    });
    expect(limitsWith(limits, { iterations: 30, minutes: 9000 })).toEqual({ goal: 0.8, iterations: 12, minutes: 600 });
    expect(limitsWith(limits, { goal: Number.NaN })).toEqual(limits);
  });
});
