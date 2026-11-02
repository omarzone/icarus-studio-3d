import type { ProjectSummary as EngineSummary, Revision, TemplateInfo } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import {
  projectFootprint,
  projectView,
  relativeTime,
  revisionViews,
  savedTime,
  templateView,
  withRuns,
} from "./project-views.ts";
import { status } from "./testdata/training-runs.ts";

const now = new Date("2026-11-01T12:00:00Z");

describe("relativeTime", () => {
  it.each([
    ["2026-11-01T11:59:40Z", "just now"],
    ["2026-11-01T11:55:00Z", "5 min ago"],
    ["2026-11-01T09:00:00Z", "3 h ago"],
    ["2026-10-31T10:00:00Z", "yesterday"],
    ["2026-10-28T12:00:00Z", "4 days ago"],
  ])("%s is %s", (iso, expected) => {
    expect(relativeTime(iso, now)).toBe(expected);
  });
});

function revision(number: number, parent: number | null, author: "user" | "copilot" = "user"): Revision {
  return {
    number,
    parent,
    author,
    summary: `Change ${number}`,
    operations: [],
    created_at: "2026-11-01T11:55:00Z",
    restored_from: null,
  };
}

it("lists revisions newest first and marks the current one", () => {
  const views = revisionViews([revision(1, null), revision(2, 1, "copilot"), revision(3, 1)], 2, now);
  expect(views.map((view) => [view.id, view.author, view.current])).toEqual([
    ["3", "you", false],
    ["2", "copilot", true],
    ["1", "you", false],
  ]);
  expect(views[0]).toMatchObject({ change: "Change 3", when: "5 min ago" });
});

it("maps templates to how they open", () => {
  const info = (id: string): TemplateInfo => ({ id, label: id, description: "d", family: "none" });
  expect(templateView(info("empty_world")).kind).toBe("empty-world");
  expect(templateView(info("parking_car")).kind).toBe("example");
});

it("describes a project by its revision", () => {
  const summary: EngineSummary = {
    id: "0123456789ab",
    name: "Lot",
    description: "Park it",
    revision: 4,
    updated_at: "2026-11-01T11:00:00Z",
  };
  expect(projectView(summary)).toMatchObject({
    id: "0123456789ab",
    name: "Lot",
    description: "Park it",
    status: "draft",
    statusLine: "Revision 4 · design checks passed",
    revision: "rev 4",
  });
});

describe("savedTime", () => {
  it("shows the clock time of a save made today and how long ago otherwise", () => {
    const now = new Date(2026, 10, 2, 18, 0);
    expect(savedTime(new Date(2026, 10, 2, 9, 5).toISOString(), now)).toBe("09:05");
    expect(savedTime(new Date(2026, 10, 1, 17, 0).toISOString(), now)).toBe("yesterday");
  });
});

describe("withRuns", () => {
  const draft = projectView({ id: "p", name: "Lot", description: "", revision: 4 });

  it("marks a project training while one of its runs is live", () => {
    const view = withRuns(draft, [status({ state: "done" }), status({ state: "running" })]);
    expect(view).toMatchObject({ status: "training", statusLine: "Training · Run 3 at 31%" });
  });

  it.each(["starting", "stopping"] as const)("counts a %s run as training", (state) => {
    expect(withRuns(draft, [status({ state })]).status).toBe("training");
  });

  it("keeps a project whose runs all ended as a draft", () => {
    expect(withRuns(draft, [status({ state: "done" }), status({ state: "failed" })])).toEqual(draft);
  });

  it("does not divide by a run without steps", () => {
    expect(withRuns(draft, [status({ state: "starting", step: 0, total_steps: 0 })]).statusLine).toBe(
      "Training · Run 3 at 0%",
    );
  });
});

it("counts the runs a project keeps without claiming a size the engine does not measure", () => {
  expect(projectFootprint([status(), status({ state: "done" })])).toEqual({
    trainingRuns: 2,
    runsBytes: null,
    runsFollowProject: false,
  });
});
