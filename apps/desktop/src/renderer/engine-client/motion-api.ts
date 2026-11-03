import type {
  MotionChoice,
  MotionClip,
  MotionComparison,
  MotionExportFile,
  MotionExportRequest,
  MotionTracking,
  MotionTrain,
  MotionVideoUpload,
  MotionWorkspace,
  RunStatus,
} from "@icarus/contracts";
import { request } from "./request.ts";
import { has, isListOf, isRecord } from "./response-checks.ts";
import { isRunStatus } from "./training-checks.ts";

// Every item passes a check that reads only the fields the app uses.
const allOf = (value: unknown, test: (entry: unknown) => boolean): boolean => Array.isArray(value) && value.every(test);

// The motion workspace on the engine: a reference video, its pose tracking, imitation training and export.

const TRACKING_STATES: readonly unknown[] = ["idle", "running", "done", "failed", "stopped"];

const isNumberOrNull = (value: unknown): value is number | null => value === null || typeof value === "number";
const isAngles = (value: unknown): boolean => allOf(value, (row) => isListOf(row, isNumberOrNull));

export function isMotionClip(value: unknown): value is MotionClip {
  return (
    isRecord(value) &&
    has(value, "id", "string") &&
    has(value, "created_at", "string") &&
    isRecord(value.video) &&
    has(value.video, "name", "string") &&
    has(value.video, "fps", "number") &&
    has(value.video, "frames", "number") &&
    has(value.video, "duration", "number") &&
    (value.frames === undefined ||
      allOf(value.frames, (frame) => isRecord(frame) && has(frame, "time", "number") && Array.isArray(frame.keypoints)))
  );
}

export function isMotionTracking(value: unknown): value is MotionTracking {
  return (
    isRecord(value) &&
    has(value, "clip", "string") &&
    TRACKING_STATES.includes(value.state) &&
    has(value, "frame", "number") &&
    has(value, "frames", "number")
  );
}

function isComparison(value: unknown): value is MotionComparison {
  return (
    isRecord(value) &&
    has(value, "run_id", "string") &&
    has(value, "run_name", "string") &&
    has(value, "fps", "number") &&
    has(value, "step", "number") &&
    has(value, "overall", "number") &&
    has(value, "weakest", "number") &&
    allOf(value.segments, (segment) => typeof segment === "string") &&
    isAngles(value.reference) &&
    isAngles(value.result) &&
    allOf(value.match, (item) => typeof item === "number") &&
    allOf(value.parts, (part) => isRecord(part) && has(part, "segment", "string") && has(part, "match", "number"))
  );
}

export function isMotionWorkspace(value: unknown): value is MotionWorkspace {
  return (
    isRecord(value) &&
    (value.clip === null || isMotionClip(value.clip)) &&
    (value.tracking === null || isMotionTracking(value.tracking)) &&
    (value.pose_model === null || typeof value.pose_model === "string") &&
    (value.reference === null || isRecord(value.reference)) &&
    (value.comparison === null || isComparison(value.comparison))
  );
}

export function isMotionExportFile(value: unknown): value is MotionExportFile {
  return (
    isRecord(value) &&
    has(value, "name", "string") &&
    has(value, "media_type", "string") &&
    has(value, "content", "string") &&
    has(value, "frames", "number")
  );
}

const at = (projectId: string) => `/projects/${encodeURIComponent(projectId)}/motion`;
const post = (body?: unknown): RequestInit => ({
  method: "POST",
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const motionApi = {
  workspace: (projectId: string): Promise<MotionWorkspace> => request(at(projectId), {}, isMotionWorkspace),
  addVideo: (projectId: string, body: MotionVideoUpload): Promise<MotionClip> =>
    request(`${at(projectId)}/videos`, post(body), isMotionClip),
  choose: (projectId: string, body: MotionChoice): Promise<MotionClip> =>
    request(`${at(projectId)}/choice`, post(body), isMotionClip),
  track: (projectId: string): Promise<MotionTracking> => request(`${at(projectId)}/tracking`, post(), isMotionTracking),
  train: (projectId: string, body: MotionTrain): Promise<RunStatus> =>
    request(`${at(projectId)}/train`, post(body), isRunStatus),
  export: (projectId: string, body: MotionExportRequest): Promise<MotionExportFile> =>
    request(`${at(projectId)}/export`, post(body), isMotionExportFile),
};

export type MotionApi = typeof motionApi;
