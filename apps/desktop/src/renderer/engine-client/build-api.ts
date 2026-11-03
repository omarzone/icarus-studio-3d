import type {
  BuildTarget,
  ExportChoice,
  ExportFile,
  ExportPlan,
  ExportRequest,
  ExportResult,
  HardwareCheck,
  HardwareCheckRequest,
  HardwareRow,
} from "@icarus/contracts";
import { request } from "./request.ts";
import { has, isListOf, isRecord } from "./response-checks.ts";

// What a project can be built into on the engine: targets, export plans, writing an export and hardware checks.

const TARGETS: readonly unknown[] = ["community", "export-brain", "hardware", "game", "animation"];
const FORMATS: readonly unknown[] = ["onnx", "urdf", "mjcf", "package"];
const STATUSES: readonly unknown[] = ["pass", "warn", "fail", "skipped"];
const VERDICTS: readonly unknown[] = ["pass", "warn", "fail"];

const isString = (value: unknown): value is string => typeof value === "string";
const isNumberOrNull = (value: unknown) => value === null || typeof value === "number";

export function isBuildTarget(value: unknown): value is BuildTarget {
  return isRecord(value) && TARGETS.includes(value.kind) && has(value, "detail", "string");
}

function isExportFile(value: unknown): value is ExportFile {
  return has(value, "path", "string") && has(value, "bytes", "number") && has(value, "description", "string");
}

export function isExportPlan(value: unknown): value is ExportPlan {
  const brain = isRecord(value) ? value.brain : undefined;
  return (
    isRecord(value) &&
    FORMATS.includes(value.format) &&
    has(value, "name", "string") &&
    has(value, "total_bytes", "number") &&
    isListOf(value.files, isExportFile) &&
    isListOf(value.options, isString) &&
    (value.notes === undefined || isListOf(value.notes, isString)) &&
    (brain === null ||
      (has(brain, "run_name", "string") &&
        has(brain, "inputs", "number") &&
        has(brain, "outputs", "number") &&
        has(brain, "rate_hz", "number")))
  );
}

export function isExportResult(value: unknown): value is ExportResult {
  return (
    isRecord(value) &&
    has(value, "path", "string") &&
    has(value, "total_bytes", "number") &&
    isListOf(value.files, isExportFile)
  );
}

function isHardwareRow(value: unknown): value is HardwareRow {
  return (
    isRecord(value) &&
    has(value, "id", "string") &&
    has(value, "part", "string") &&
    (value.kind === "joint" || value.kind === "sensor") &&
    (value.hardware === null || typeof value.hardware === "string") &&
    isNumberOrNull(value.need) &&
    isNumberOrNull(value.limit) &&
    has(value, "unit", "string") &&
    has(value, "fraction", "number") &&
    STATUSES.includes(value.status) &&
    has(value, "measured", "boolean") &&
    has(value, "gap", "string")
  );
}

const isKit = (value: unknown) =>
  has(value, "id", "string") && has(value, "name", "string") && has(value, "board", "string");

export function isHardwareCheck(value: unknown): value is HardwareCheck {
  return (
    isRecord(value) &&
    isKit(value.kit) &&
    Array.isArray(value.kits) &&
    value.kits.every(isKit) &&
    isListOf(value.rows, isHardwareRow) &&
    VERDICTS.includes(value.verdict) &&
    (value.problem === null || (has(value.problem, "title", "string") && has(value.problem, "fix", "string"))) &&
    Array.isArray(value.parts) &&
    value.parts.every(
      (part) => has(part, "name", "string") && has(part, "count", "number") && has(part, "usd", "number"),
    ) &&
    isListOf(value.safety, isString) &&
    (value.measured_from === null || typeof value.measured_from === "string")
  );
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const at = (project: string, path: string) => `/projects/${encodeURIComponent(project)}/${path}`;

export const buildApi = {
  targets: (project: string): Promise<BuildTarget[]> =>
    request(at(project, "build/targets"), {}, (value): value is BuildTarget[] => isListOf(value, isBuildTarget)),
  plan: (project: string, choice: ExportChoice): Promise<ExportPlan> =>
    request(at(project, "export/plan"), post(choice), isExportPlan),
  write: (project: string, body: ExportRequest): Promise<ExportResult> =>
    request(at(project, "export"), post(body), isExportResult),
  hardware: (project: string, body: HardwareCheckRequest): Promise<HardwareCheck> =>
    request(at(project, "hardware/check"), post(body), isHardwareCheck),
};

export type BuildApi = typeof buildApi;
