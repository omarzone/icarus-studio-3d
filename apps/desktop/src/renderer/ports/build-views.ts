import type { ExportPlan as EnginePlan, HardwareCheck, HardwareRow } from "@icarus/contracts";
import type { ExportFormat, ExportOptionId, ExportPlan, HardwareCheckRow, HardwareSession } from "./build-port.ts";

// Engine build documents as the Build workspace shows them.

export const EXPORT_FORMATS: ExportPlan["formats"] = [
  { format: "onnx", label: "ONNX brain" },
  { format: "urdf", label: "URDF robot" },
  { format: "mjcf", label: "MuJoCo" },
  { format: "package", label: "Runtime package" },
];

export const EXPORT_OPTIONS: readonly { id: ExportOptionId; label: string }[] = [
  { id: "spec", label: "Include the brain's inputs and outputs" },
  { id: "runtime", label: "Include a README and a reference script" },
  { id: "parts", label: "Include the parts list" },
  { id: "history", label: "Include training history" },
];

export type ExportChoiceState = { format: ExportFormat; options: ReadonlySet<ExportOptionId> };

export const DEFAULT_CHOICE: ExportChoiceState = { format: "package", options: new Set(["spec", "runtime", "parts"]) };

export function exportPlanView(plan: EnginePlan, choice: ExportChoiceState): ExportPlan {
  return {
    formats: EXPORT_FORMATS,
    format: choice.format,
    options: EXPORT_OPTIONS.map((option) => ({ ...option, on: choice.options.has(option.id) })),
    name: plan.name,
    files: plan.files.map((file) => ({ path: file.path, bytes: file.bytes, description: file.description })),
    totalBytes: plan.total_bytes,
    brain: plan.brain
      ? {
          name: `${plan.brain.run_name} · step ${plan.brain.step.toLocaleString("en-US")}`,
          inputs: plan.brain.inputs,
          outputs: plan.brain.outputs,
          rateHz: plan.brain.rate_hz,
        }
      : null,
    notes: plan.notes ?? [],
  };
}

function figure(value: number): string {
  return value < 10 ? value.toFixed(2) : value.toFixed(0);
}

export function rowReading(row: HardwareRow): string {
  if (row.status === "skipped") {
    return "skipped";
  }
  if (row.hardware === null) {
    return row.role === "estimate" ? "estimate" : "no part";
  }
  if (row.need === null || row.limit === null) {
    return "covered";
  }
  return `${figure(row.need)} / ${figure(row.limit)} ${row.unit}`;
}

function rowView(row: HardwareRow): HardwareCheckRow {
  return {
    id: row.id,
    name: row.part,
    hardware: row.hardware,
    reading: rowReading(row),
    fraction: Math.min(1, row.fraction),
    status: row.status,
    gap: row.gap,
  };
}

export function hardwareSessionView(check: HardwareCheck): HardwareSession {
  const passing = check.verdict === "pass";
  const measured = check.measured_from
    ? `Measured with ${check.measured_from}.`
    : "No trained brain yet: needs are the design's limits.";
  return {
    kit: { id: check.kit.id, name: check.kit.name, board: check.kit.board },
    verdict: check.verdict,
    steps: [
      { label: "Pick the hardware", status: "done" },
      { label: "Check joints and sensors", status: passing ? "done" : "current" },
      { label: "Export robot and brain", status: passing ? "current" : "todo" },
      { label: "Run it on the device", status: "todo" },
    ],
    check: {
      instructions: `${measured} Every joint and sensor against the kit's rated limits:`,
      rows: check.rows.map(rowView),
      problem: check.problem ? { title: check.problem.title, fix: check.problem.fix } : null,
    },
    safety: check.safety,
    parts: check.parts.map((part) => ({ name: part.name, count: part.count, usd: part.usd })),
  };
}

// The row Recheck and Skip act on: the first that fails, else the first that warns.
export function rowNeedingAttention(rows: readonly HardwareCheckRow[]): HardwareCheckRow | undefined {
  return rows.find((row) => row.status === "fail") ?? rows.find((row) => row.status === "warn");
}
