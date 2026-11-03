import { expect, it } from "vitest";
import { isProjectActivity, isProjectClosed } from "../../engine-client/project-activity-checks.ts";
import type { ProjectWork } from "../../ports/projects-port.ts";
import { stillEndingNotice, workLine } from "./close-project-dialog.tsx";

const run: ProjectWork = { kind: "training", id: "run-1", title: "Run 3", progress: 0.404 };
const tracking: ProjectWork = { kind: "task", id: "t1", title: "Track the motion in salsa.mp4", progress: null };
const pilot: ProjectWork = { kind: "autopilot", id: "p", title: "Autopilot", progress: null };

it("says what each running thing is before the project closes", () => {
  expect([run, tracking, pilot].map(workLine)).toEqual([
    "Run 3 is training · 40%",
    "Track the motion in salsa.mp4",
    "The autopilot is driving the training",
  ]);
});

it("tells the person only about work that was still ending when the close stopped waiting", () => {
  expect(stillEndingNotice([])).toBeNull();
  expect(stillEndingNotice([pilot, run])).toEqual({
    title: "Still finishing",
    detail: "The autopilot, Run 3 was asked to stop and ends on its own.",
  });
});

it("accepts the engine's answers and rejects work of an unknown kind", () => {
  const work = { kind: "training", id: "run-1", title: "Run 3", progress: 0.5 };
  expect(isProjectActivity({ project_id: "p", running: [work] })).toBe(true);
  expect(isProjectClosed({ project_id: "p", stopped: [work], still_running: [] })).toBe(true);
  expect(isProjectActivity({ project_id: "p", running: [{ ...work, kind: "render" }] })).toBe(false);
  expect(isProjectClosed({ project_id: "p", stopped: [work] })).toBe(false);
});
