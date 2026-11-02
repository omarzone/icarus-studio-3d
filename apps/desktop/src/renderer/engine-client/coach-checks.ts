import type { AutopilotLogLine, AutopilotStatus, Diagnosis, FailureGroup } from "@icarus/contracts";
import { has, isListOf, isRecord } from "./response-checks.ts";

// Structural checks of the coach's answers: diagnoses, failure groups and the autopilot status.

const NEXT_STEPS: readonly string[] = ["keep_training", "stop_and_fix", "done"];
const AUTOPILOT_STATES: readonly string[] = ["running", "waiting_approval", "done", "stopped", "failed"];

const isString = (value: unknown): value is string => typeof value === "string";

function isOptional(value: Record<string, unknown>, key: string, kind: "string" | "number"): boolean {
  const field = value[key];
  return field === undefined || field === null || typeof field === kind;
}

export function isFailureGroup(value: unknown): value is FailureGroup {
  return (
    isRecord(value) &&
    has(value, "label", "string") &&
    has(value, "share", "number") &&
    has(value, "description", "string") &&
    (value.frame_attachment_ids === undefined || isListOf(value.frame_attachment_ids, isString))
  );
}

export function isFailureGroups(value: unknown): value is FailureGroup[] {
  return isListOf(value, isFailureGroup);
}

export function isDiagnosis(value: unknown): value is Diagnosis {
  return (
    isRecord(value) &&
    has(value, "id", "string") &&
    has(value, "run_id", "string") &&
    has(value, "step", "number") &&
    has(value, "created_at", "string") &&
    has(value, "summary", "string") &&
    has(value, "hypothesis", "string") &&
    isListOf(value.observations, isString) &&
    isListOf(value.failure_groups, isFailureGroup) &&
    typeof value.next_step === "string" &&
    NEXT_STEPS.includes(value.next_step) &&
    isOptional(value, "proposal_id", "string")
  );
}

export function isDiagnoses(value: unknown): value is Diagnosis[] {
  return isListOf(value, isDiagnosis);
}

function isLogLine(value: unknown): value is AutopilotLogLine {
  return isRecord(value) && has(value, "time", "string") && has(value, "text", "string");
}

export function isAutopilotStatus(value: unknown): value is AutopilotStatus {
  return (
    isRecord(value) &&
    (value.mode === "ask" || value.mode === "fix") &&
    typeof value.state === "string" &&
    AUTOPILOT_STATES.includes(value.state) &&
    has(value, "iteration", "number") &&
    has(value, "max_iterations", "number") &&
    has(value, "goal_success", "number") &&
    isOptional(value, "best_success", "number") &&
    isListOf(value.run_ids, isString) &&
    isListOf(value.log, isLogLine)
  );
}
