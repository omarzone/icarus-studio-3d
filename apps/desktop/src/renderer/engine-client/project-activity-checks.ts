import type { ProjectActivity, ProjectClosed, ProjectWork } from "@icarus/contracts";
import { has, isListOf, isRecord } from "./response-checks.ts";

const WORK_KINDS: readonly unknown[] = ["training", "autopilot", "task"];

function isProjectWork(value: unknown): value is ProjectWork {
  return (
    isRecord(value) &&
    WORK_KINDS.includes(value.kind) &&
    has(value, "id", "string") &&
    has(value, "title", "string") &&
    (value.progress === undefined || value.progress === null || typeof value.progress === "number")
  );
}

export function isProjectActivity(value: unknown): value is ProjectActivity {
  return isRecord(value) && has(value, "project_id", "string") && isListOf(value.running, isProjectWork);
}

export function isProjectClosed(value: unknown): value is ProjectClosed {
  return (
    isRecord(value) &&
    has(value, "project_id", "string") &&
    isListOf(value.stopped, isProjectWork) &&
    isListOf(value.still_running, isProjectWork)
  );
}
