import { pending } from "../app/runtime/pending.ts";
import { definePort } from "../app/runtime/port.tsx";
import { createBuildFixture } from "./build.fixture.ts";

// What the Build workspace can do with a project: its targets, brain exports and the real hardware flow.
export type BuildTargetKind = "community" | "export-brain" | "hardware" | "game" | "animation";

export type BuildTarget = {
  kind: BuildTargetKind;
  // Short facts under the target name ("ONNX file · 1.2 MB", "Parts list · about $189").
  detail: string;
};

export type ExportFormat = "onnx" | "torchscript" | "unity-sentis";

export type ExportOptionId = "sensor-layout" | "runnable-example" | "training-history";

export type ExportPlan = {
  formats: readonly { format: ExportFormat; label: string }[];
  format: ExportFormat;
  options: readonly { id: ExportOptionId; label: string; on: boolean }[];
  file: { name: string; bytes: number; inputs: number; outputs: number; rateHz: number };
};

export type HardwareStepStatus = "done" | "current" | "todo";

export type SensorReading = {
  name: string;
  // Distance in meters; null while the device sends nothing for this sensor.
  meters: number | null;
  // Share of the sensor's range, for the reading bar.
  fraction: number;
  ok: boolean;
};

export type HardwareSession = {
  // Kind of device the brain runs on ("RC car").
  device: string;
  connection: { host: string; board: string; sensorsFound: number } | null;
  steps: readonly { label: string; status: HardwareStepStatus }[];
  calibration: {
    instructions: string;
    readings: readonly SensorReading[];
    problem: { title: string; fix: string } | null;
  };
  safety: readonly string[];
  parts: readonly { name: string; usd: number }[];
};

export type BuildPort = {
  listTargets: (project: string) => Promise<BuildTarget[]>;
  getExportPlan: (project: string) => Promise<ExportPlan>;
  setExportFormat: (input: { project: string; format: ExportFormat }) => Promise<ExportPlan>;
  setExportOption: (input: { project: string; id: ExportOptionId; on: boolean }) => Promise<ExportPlan>;
  downloadExport: (project: string) => Promise<void>;
  getHardware: (project: string) => Promise<HardwareSession>;
  recheckSensor: (input: { project: string; sensor: string }) => Promise<HardwareSession>;
  skipSensor: (input: { project: string; sensor: string }) => Promise<HardwareSession>;
};

const buildIds = ["SCR-BUILD", "MOD-EXPORT-BRAIN", "MOD-PUBLISH", "MOD-PUBLISHED"] as const;

export const buildPort = definePort<BuildPort>({
  app: {
    listTargets: pending({
      key: "build.targets",
      summary: "What you can build from a project",
      sprint: 12,
      ids: [...buildIds],
    }),
    getExportPlan: pending({
      key: "build.export-plan",
      summary: "Exporting a brain",
      sprint: 12,
      ids: ["MOD-EXPORT-BRAIN"],
    }),
    setExportFormat: pending({
      key: "build.export-format",
      summary: "Choosing the brain export format",
      sprint: 12,
      ids: ["MOD-EXPORT-BRAIN"],
    }),
    setExportOption: pending({
      key: "build.export-option",
      summary: "Choosing what goes in a brain export",
      sprint: 12,
      ids: ["MOD-EXPORT-BRAIN"],
    }),
    downloadExport: pending({
      key: "build.export-download",
      summary: "Downloading an exported brain",
      sprint: 12,
      ids: ["MOD-EXPORT-BRAIN"],
    }),
    getHardware: pending({
      key: "build.hardware",
      summary: "Running a brain on real hardware",
      sprint: 12,
      ids: ["STA-BUILD-HARDWARE"],
    }),
    recheckSensor: pending({
      key: "build.hardware-recheck",
      summary: "Checking a sensor on the device again",
      sprint: 12,
      ids: ["STA-BUILD-HARDWARE"],
    }),
    skipSensor: pending({
      key: "build.hardware-skip",
      summary: "Running without one sensor",
      sprint: 12,
      ids: ["STA-BUILD-HARDWARE"],
    }),
  },
  prototype: createBuildFixture,
});
