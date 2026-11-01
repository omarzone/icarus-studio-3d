import type {
  CheckpointInfo,
  CopyPoses,
  LogLine,
  MetricPoint,
  Rollout,
  RolloutFrame,
  RunEvent,
  RunEventEnvelope,
  RunStatus,
  TrainingSettings,
  TrainingSnapshot,
} from "@icarus/contracts";
import { has, isListOf, isRecord, isTriple } from "./response-checks.ts";

// Structural checks of training answers and run events: the fields the app reads, not the whole schema.

const RUN_STATES: readonly string[] = ["starting", "running", "stopping", "done", "stopped", "failed"];
const LOG_LEVELS: readonly string[] = ["info", "warn", "error"];

function isOptionalNumber(value: Record<string, unknown>, key: string): boolean {
  const field = value[key];
  return field === undefined || field === null || typeof field === "number";
}

function isFailure(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (isRecord(value) && has(value, "reason", "string") && isListOf(value.details, isString))
  );
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isRunStatus(value: unknown): value is RunStatus {
  return (
    isRecord(value) &&
    has(value, "run_id", "string") &&
    has(value, "project_id", "string") &&
    has(value, "name", "string") &&
    typeof value.state === "string" &&
    RUN_STATES.includes(value.state) &&
    has(value, "revision_number", "number") &&
    has(value, "step", "number") &&
    has(value, "total_steps", "number") &&
    has(value, "copies", "number") &&
    has(value, "steps_per_second", "number") &&
    has(value, "started_at", "string") &&
    isOptionalNumber(value, "best_step") &&
    isOptionalNumber(value, "success_rate") &&
    isFailure(value.failure)
  );
}

export function isRunStatuses(value: unknown): value is RunStatus[] {
  return isListOf(value, isRunStatus);
}

function isNumberMap(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "number");
}

export function isMetricPoint(value: unknown): value is MetricPoint {
  return (
    isRecord(value) &&
    (value.kind === "train" || value.kind === "eval") &&
    has(value, "step", "number") &&
    has(value, "elapsed", "number") &&
    has(value, "episode_return", "number") &&
    has(value, "episode_length", "number") &&
    isOptionalNumber(value, "success_rate") &&
    isOptionalNumber(value, "failure_rate") &&
    isOptionalNumber(value, "steps_per_second") &&
    isNumberMap(value.reward_terms)
  );
}

export function isMetricPoints(value: unknown): value is MetricPoint[] {
  return isListOf(value, isMetricPoint);
}

export function isCheckpointInfo(value: unknown): value is CheckpointInfo {
  return (
    isRecord(value) &&
    has(value, "step", "number") &&
    has(value, "episode_return", "number") &&
    has(value, "has_rollout", "boolean") &&
    isOptionalNumber(value, "success_rate") &&
    isOptionalNumber(value, "failure_rate")
  );
}

export function isCheckpoints(value: unknown): value is CheckpointInfo[] {
  return isListOf(value, isCheckpointInfo);
}

// Poses of `count` geoms: one position and one wxyz quaternion each.
function isPoses(value: Record<string, unknown>, count: number): boolean {
  const { positions, quaternions } = value;
  return (
    Array.isArray(positions) &&
    Array.isArray(quaternions) &&
    positions.length === count &&
    quaternions.length === count &&
    positions.every((item) => isTriple(item, 3)) &&
    quaternions.every((item) => isTriple(item, 4))
  );
}

export function isTrainingSnapshot(value: unknown): value is TrainingSnapshot {
  if (!isRecord(value) || !has(value, "step", "number") || !isListOf(value.geoms, isString)) {
    return false;
  }
  const count = value.geoms.length;
  return isListOf(value.copies, (copy): copy is CopyPoses => isRecord(copy) && isPoses(copy, count));
}

export function isRollout(value: unknown): value is Rollout {
  if (
    !isRecord(value) ||
    !has(value, "step", "number") ||
    !has(value, "seed", "number") ||
    !has(value, "episode_return", "number") ||
    !has(value, "outcome", "string") ||
    !isListOf(value.geoms, isString)
  ) {
    return false;
  }
  const count = value.geoms.length;
  return isListOf(
    value.frames,
    (frame): frame is RolloutFrame =>
      isRecord(frame) && has(frame, "time", "number") && has(frame, "reward", "number") && isPoses(frame, count),
  );
}

export function isLogLine(value: unknown): value is LogLine {
  return (
    isRecord(value) &&
    has(value, "elapsed", "number") &&
    has(value, "text", "string") &&
    typeof value.level === "string" &&
    LOG_LEVELS.includes(value.level)
  );
}

function isRunEvent(value: unknown): value is RunEvent {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.type) {
    case "status":
      return isRunStatus(value.status);
    case "metric":
      return isMetricPoint(value.metric);
    case "checkpoint":
      return isCheckpointInfo(value.checkpoint);
    case "snapshot":
      return isTrainingSnapshot(value.snapshot);
    case "log":
      return isLogLine(value.line);
    default:
      return false;
  }
}

export function isRunEventEnvelope(value: unknown): value is RunEventEnvelope {
  return isRecord(value) && isRunEvent(value.event);
}

export function isTrainingSettings(value: unknown): value is TrainingSettings {
  return (
    isRecord(value) &&
    has(value, "threads", "number") &&
    has(value, "max_threads", "number") &&
    has(value, "use_graphics_card", "boolean") &&
    (value.graphics_card === null || typeof value.graphics_card === "string") &&
    has(value, "projects_folder", "string") &&
    has(value, "runs_folder", "string")
  );
}
