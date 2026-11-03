import { definePort } from "../app/runtime/port.tsx";
import { createBuildFixture } from "./build.fixture.ts";
import { createEngineBuild } from "./build-engine.ts";

// What the Build workspace can do with a project: its targets, exports and the check against real hardware.
export type BuildTargetKind = "community" | "export-brain" | "hardware" | "game" | "animation";

export type BuildTarget = {
  kind: BuildTargetKind;
  // Short facts under the target name ("ONNX file · 1.2 MB", "Parts list · about $189").
  detail: string;
};

export type ExportFormat = "onnx" | "urdf" | "mjcf" | "package";

export type ExportOptionId = "spec" | "runtime" | "parts" | "history";

export type ExportFile = { path: string; bytes: number; description: string };

export type ExportPlan = {
  formats: readonly { format: ExportFormat; label: string }[];
  format: ExportFormat;
  options: readonly { id: ExportOptionId; label: string; on: boolean }[];
  // Suggested zip file name.
  name: string;
  files: readonly ExportFile[];
  totalBytes: number;
  // The trained brain the export carries; null before any training.
  brain: { name: string; inputs: number; outputs: number; rateHz: number } | null;
  // What is left out or approximated, and why.
  notes: readonly string[];
};

export type ExportDownload = { kind: "saved"; path: string; bytes: number } | { kind: "cancelled" };

export type HardwareStepStatus = "done" | "current" | "todo";

export type HardwareCheckStatus = "pass" | "warn" | "fail" | "skipped";

export type HardwareCheckRow = {
  id: string;
  // The body's joint or sensor.
  name: string;
  // The kit's part for it; null when the kit has none.
  hardware: string | null;
  // What it needs against what the part gives ("0.42 / 1.00 N·m"), or why it cannot be compared.
  reading: string;
  // Share of the part's rating used, for the bar.
  fraction: number;
  status: HardwareCheckStatus;
  // The gap between simulation and hardware, in words.
  gap: string;
};

export type HardwareSession = {
  kit: { id: string; name: string; board: string };
  verdict: "pass" | "warn" | "fail";
  steps: readonly { label: string; status: HardwareStepStatus }[];
  check: {
    instructions: string;
    rows: readonly HardwareCheckRow[];
    problem: { title: string; fix: string } | null;
  };
  safety: readonly string[];
  parts: readonly { name: string; count: number; usd: number }[];
};

export type BuildPort = {
  listTargets: (project: string) => Promise<BuildTarget[]>;
  getExportPlan: (project: string) => Promise<ExportPlan>;
  setExportFormat: (input: { project: string; format: ExportFormat }) => Promise<ExportPlan>;
  setExportOption: (input: { project: string; id: ExportOptionId; on: boolean }) => Promise<ExportPlan>;
  downloadExport: (project: string) => Promise<ExportDownload>;
  getHardware: (project: string) => Promise<HardwareSession>;
  // Checks the part again against the project's current revision.
  recheckPart: (input: { project: string; part: string }) => Promise<HardwareSession>;
  // Leaves the part out of the verdict: the person accepts its gap.
  skipPart: (input: { project: string; part: string }) => Promise<HardwareSession>;
};

export const buildPort = definePort<BuildPort>({
  app: createEngineBuild(),
  prototype: createBuildFixture,
});
