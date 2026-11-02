import type { EngineEvent, EngineEventEnvelope, TaskInfo } from "@icarus/contracts";
import { isAgentStep } from "./copilot-checks.ts";
import { has, isListOf, isRecord } from "./response-checks.ts";
import { isRunEventEnvelope } from "./training-checks.ts";

// Structural checks of the engine's event stream and task list: the fields the app reads, not the whole schema.

const TASK_KINDS: readonly string[] = ["training_run", "autopilot", "diagnosis", "ideas", "build", "agent_turn"];
const TASK_STATES: readonly string[] = ["running", "done", "stopped", "failed"];
const FINAL_STATES: readonly string[] = ["done", "stopped", "failed"];

function isOneOf(value: unknown, options: readonly string[]): boolean {
  return typeof value === "string" && options.includes(value);
}

function isNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

export function isTaskInfo(value: unknown): value is TaskInfo {
  return (
    isRecord(value) &&
    has(value, "id", "string") &&
    isNullableString(value.project_id) &&
    isOneOf(value.kind, TASK_KINDS) &&
    isOneOf(value.state, TASK_STATES) &&
    (value.progress === undefined || value.progress === null || typeof value.progress === "number") &&
    has(value, "title", "string") &&
    has(value, "started_at", "string")
  );
}

export function isTaskInfos(value: unknown): value is TaskInfo[] {
  return isListOf(value, isTaskInfo);
}

function isEngineEvent(value: unknown): value is EngineEvent {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.type) {
    case "turn_started":
      return has(value, "turn_id", "string");
    case "step":
      return has(value, "turn_id", "string") && isAgentStep(value.step);
    case "view_taken":
      return has(value, "turn_id", "string") && has(value, "attachment_id", "string");
    case "proposal_created":
      return has(value, "proposal_id", "string") && has(value, "summary", "string");
    case "proposal_applied":
      return has(value, "proposal_id", "string") && has(value, "revision", "number");
    case "turn_finished":
      return has(value, "turn_id", "string");
    case "task_started":
      return isTaskInfo(value.task);
    case "task_progress":
      return has(value, "task_id", "string") && has(value, "progress", "number") && has(value, "text", "string");
    case "task_finished":
      return has(value, "task_id", "string") && isOneOf(value.state, FINAL_STATES);
    case "run_event":
      return has(value, "run_id", "string") && isRunEventEnvelope({ event: value.event });
    case "diagnosis_created":
      return has(value, "diagnosis_id", "string") && has(value, "run_id", "string");
    case "revision_created":
      return has(value, "revision", "number") && (value.author === "user" || value.author === "copilot");
    case "hook_decision":
      return has(value, "action", "string") && has(value, "point", "string");
    case "message_posted":
      return has(value, "message_id", "string") && (value.role === "user" || value.role === "copilot");
    default:
      return false;
  }
}

export function isEngineEventEnvelope(value: unknown): value is EngineEventEnvelope {
  return isRecord(value) && has(value, "id", "string") && isEngineEvent(value.event);
}
