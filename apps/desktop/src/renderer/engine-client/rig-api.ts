import type {
  AutoRigStart,
  AutoRigStatus,
  PoseRequest,
  PoseResult,
  RigCheck,
  RigFixResult,
  SkinWeights,
} from "@icarus/contracts";
import { request } from "./request.ts";
import { has, isListOf, isRecord, isSceneDescription } from "./response-checks.ts";

// Every item passes a check that reads only the fields the app uses.
const allOf = (value: unknown, test: (entry: unknown) => boolean): boolean => Array.isArray(value) && value.every(test);

// A body's rig on the engine: auto-rigging a mesh, the rig check with its fixes, test poses and skin weights.

const STEP_STATES: readonly unknown[] = ["done", "running", "todo"];
const RIG_STATES: readonly unknown[] = ["running", "done", "failed", "stopped"];
const CHECK_STATUSES: readonly unknown[] = ["pass", "fail", "skip"];

const isText = (value: unknown): value is string => typeof value === "string";

function isOptional(value: Record<string, unknown>, key: string, kind: "string" | "number"): boolean {
  const field = value[key];
  return field === undefined || field === null || typeof field === kind;
}

export function isAutoRigStatus(value: unknown): value is AutoRigStatus {
  return (
    isRecord(value) &&
    has(value, "task_id", "string") &&
    has(value, "file", "string") &&
    RIG_STATES.includes(value.state) &&
    has(value, "percent", "number") &&
    allOf(value.steps, (step) => isRecord(step) && has(step, "text", "string") && STEP_STATES.includes(step.state)) &&
    isOptional(value, "shape", "string") &&
    isOptional(value, "body", "string") &&
    isOptional(value, "message", "string")
  );
}

export function isRigCheck(value: unknown): value is RigCheck {
  return (
    isRecord(value) &&
    isRecord(value.report) &&
    allOf(
      value.report.checks,
      (check) =>
        isRecord(check) &&
        has(check, "label", "string") &&
        has(check, "detail", "string") &&
        CHECK_STATUSES.includes(check.status),
    ) &&
    allOf(
      value.findings,
      (finding) =>
        isRecord(finding) &&
        has(finding, "id", "string") &&
        has(finding, "text", "string") &&
        has(finding, "fixable", "boolean"),
    ) &&
    allOf(value.poses, (pose) => isRecord(pose) && has(pose, "id", "string") && has(pose, "label", "string"))
  );
}

export function isRigFixResult(value: unknown): value is RigFixResult {
  return isRecord(value) && isListOf(value.applied, isText) && isRigCheck(value.check);
}

export function isPoseResult(value: unknown): value is PoseResult {
  return (
    isRecord(value) &&
    has(value, "pose", "string") &&
    has(value, "label", "string") &&
    has(value, "joints", "number") &&
    isListOf(value.overlaps, isText) &&
    has(value, "holds", "boolean") &&
    has(value, "seconds", "number") &&
    has(value, "sag_degrees", "number") &&
    isSceneDescription(value.scene)
  );
}

export function isSkinWeights(value: unknown): value is SkinWeights {
  return (
    isRecord(value) &&
    isOptional(value, "body", "string") &&
    allOf(
      value.bones,
      (bone) =>
        isRecord(bone) &&
        has(bone, "part", "string") &&
        has(bone, "name", "string") &&
        has(bone, "vertices", "number") &&
        has(bone, "coverage", "number") &&
        isOptional(bone, "problem", "string"),
    )
  );
}

const at = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`;
const post = (body?: unknown): RequestInit => ({
  method: "POST",
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const rigApi = {
  startAutoRig: (projectId: string, body: AutoRigStart): Promise<AutoRigStatus> =>
    request(`${at(projectId)}/auto-rig`, post(body), isAutoRigStatus),
  autoRig: (projectId: string): Promise<AutoRigStatus> => request(`${at(projectId)}/auto-rig`, {}, isAutoRigStatus),
  cancelAutoRig: (projectId: string): Promise<AutoRigStatus> =>
    request(`${at(projectId)}/auto-rig`, { method: "DELETE" }, isAutoRigStatus),
  rigCheck: (projectId: string): Promise<RigCheck> => request(`${at(projectId)}/rig-check`, {}, isRigCheck),
  fixRig: (projectId: string): Promise<RigFixResult> =>
    request(`${at(projectId)}/rig-check/fix`, post(), isRigFixResult),
  pose: (projectId: string, body: PoseRequest): Promise<PoseResult> =>
    request(`${at(projectId)}/poses`, post(body), isPoseResult),
  skinWeights: (projectId: string): Promise<SkinWeights> => request(`${at(projectId)}/skin-weights`, {}, isSkinWeights),
  rebindSkin: (projectId: string): Promise<SkinWeights> =>
    request(`${at(projectId)}/skin-weights/rebind`, post(), isSkinWeights),
};

export type RigApi = typeof rigApi;
