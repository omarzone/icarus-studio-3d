import type { RunStatus } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { liveProgress, shownSteps } from "./live-progress.ts";

const status = (update: Partial<RunStatus>): RunStatus => ({
  run_id: "run-1",
  project_id: "p",
  revision_number: 1,
  name: "Run 1",
  state: "running",
  step: 12_000,
  total_steps: 60_000,
  copies: 12,
  steps_per_second: 2000,
  started_at: "2026-11-02T00:00:00Z",
  ...update,
});

describe("live progress", () => {
  it("names what the worker is doing", () => {
    expect(liveProgress(status({ phase: "practicing" }), 0, 0).phase).toBe("Practicing");
    expect(liveProgress(status({ phase: "updating" }), 0, 0).phase).toBe("Updating the brain");
    expect(liveProgress(status({ phase: "testing", testing_step: 25_000 }), 0, 0).phase).toBe("Testing checkpoint 25k");
    expect(liveProgress(status({}), 0, 0).phase).toBeNull();
  });

  it("starts from the newest step reported by the status or a later snapshot", () => {
    expect(liveProgress(status({ phase: "practicing" }), 13_500, 0).step).toBe(13_500);
    expect(liveProgress(status({ phase: "practicing" }), 4_000, 0).step).toBe(12_000);
  });

  it("moves on at the measured speed only while practicing, at most a moment past the reported step", () => {
    const practicing = liveProgress(status({ phase: "practicing" }), 0, 1000);
    expect(shownSteps(practicing, 1500, 0)).toBe(13_000);
    expect(shownSteps(practicing, 60_000, 0)).toBe(15_000);
    const updating = liveProgress(status({ phase: "updating" }), 0, 1000);
    expect(shownSteps(updating, 5000, 0)).toBe(12_000);
  });

  it("never goes back or past the total", () => {
    const report = liveProgress(status({ phase: "practicing", step: 59_900 }), 0, 0);
    expect(shownSteps(report, 1000, 0)).toBe(60_000);
    expect(shownSteps(liveProgress(status({ phase: "updating" }), 0, 0), 0, 14_000)).toBe(14_000);
  });
});
