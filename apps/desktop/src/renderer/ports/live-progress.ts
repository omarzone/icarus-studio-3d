import type { RunStatus } from "@icarus/contracts";
import { compactNumber } from "../ui/compact-number.ts";
import type { LiveProgress } from "./training-port.ts";

// What the worker is doing, in words; old status files carry no phase.
export function phaseLabel(status: RunStatus): string | null {
  switch (status.phase) {
    case "practicing":
      return "Practicing";
    case "updating":
      return "Updating the brain";
    case "testing":
      return status.testing_step === null || status.testing_step === undefined
        ? "Testing a checkpoint"
        : `Testing checkpoint ${compactNumber(status.testing_step)}`;
    case null:
    case undefined:
      return null;
  }
}

// The newest progress the engine reported: the status, moved on by a later snapshot's step.
export function liveProgress(status: RunStatus, snapshotStep: number, now: number): LiveProgress {
  return {
    phase: phaseLabel(status),
    step: Math.min(status.total_steps, Math.max(status.step, snapshotStep)),
    total: status.total_steps,
    stepsPerSecond: status.steps_per_second,
    advancing: status.phase === "practicing",
    reportedAt: now,
  };
}

// Seconds the bar may move on past the last reported step before it waits for the next report.
const MAX_LEAD_SECONDS = 1.5;

// Where the bar is drawn at `now`: moved on at the measured rate while the copies practice, never past the total or
// further than a moment beyond the reported step, and never back.
export function shownSteps(progress: LiveProgress, now: number, shownBefore: number): number {
  const lead = progress.advancing
    ? progress.stepsPerSecond * Math.min(MAX_LEAD_SECONDS, Math.max(0, (now - progress.reportedAt) / 1000))
    : 0;
  return Math.min(progress.total, Math.max(shownBefore, progress.step + lead));
}
