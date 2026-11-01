import type {
  BuildPort,
  BuildTarget,
  ExportFormat,
  ExportOptionId,
  ExportPlan,
  HardwareSession,
  SensorReading,
} from "./build-port.ts";

// Sample data from the design, used only by the prototype, the design gallery and tests.
const TARGETS: readonly BuildTarget[] = [
  { kind: "community", detail: "Publish so others can remix it" },
  { kind: "export-brain", detail: "ONNX file · 1.2 MB" },
  { kind: "hardware", detail: "Parts list · about $189" },
  { kind: "game", detail: "Unity · Godot · Roblox" },
  { kind: "animation", detail: "glTF · FBX (for dancers)" },
];

const FORMATS: ExportPlan["formats"] = [
  { format: "onnx", label: "ONNX" },
  { format: "torchscript", label: "TorchScript" },
  { format: "unity-sentis", label: "Unity Sentis" },
];

const EXTENSIONS: Readonly<Record<ExportFormat, string>> = {
  onnx: "onnx",
  torchscript: "pt",
  "unity-sentis": "sentis",
};

const EXPORT_PLAN: ExportPlan = {
  formats: FORMATS,
  format: "onnx",
  options: [
    { id: "sensor-layout", label: "Include sensor layout and units", on: true },
    { id: "runnable-example", label: "Include a runnable example", on: true },
    { id: "training-history", label: "Include training history", on: false },
  ],
  file: { name: "park-pilot-r3-312k.onnx", bytes: 1_200_000, inputs: 11, outputs: 3, rateHz: 25 },
};

const READINGS: readonly SensorReading[] = [
  { name: "Front L", meters: 1.21, fraction: 0.4, ok: true },
  { name: "Front", meters: 2.08, fraction: 0.7, ok: true },
  { name: "Front R", meters: 1.97, fraction: 0.66, ok: true },
  { name: "Side L", meters: 0.36, fraction: 0.12, ok: true },
  { name: "Side R", meters: null, fraction: 0, ok: false },
  { name: "Rear L", meters: 1.55, fraction: 0.52, ok: true },
];

const HARDWARE: HardwareSession = {
  device: "RC car",
  connection: { host: "pi-parkpilot.local", board: "Raspberry Pi 5", sensorsFound: 8 },
  steps: [
    { label: "Get the parts", status: "done" },
    { label: "Connect", status: "done" },
    { label: "Calibrate sensors", status: "current" },
    { label: "Test drive", status: "todo" },
    { label: "Load the brain", status: "todo" },
  ],
  calibration: {
    instructions: "Put the car on the floor with nothing in front. Live readings from the real car:",
    readings: READINGS,
    problem: { title: "Side R gives no data.", fix: "Check its cable on port 5, then press Recheck." },
  },
  safety: [
    "Top speed limited to 0.5 m/s for the first drive",
    "Stop button on screen and on the car",
    "Brain runs on the Pi, no internet needed",
  ],
  parts: [
    { name: "Raspberry Pi 5", usd: 60 },
    { name: "8 × distance sensors", usd: 72 },
    { name: "RC chassis 1:16", usd: 45 },
    { name: "Steering servo", usd: 12 },
  ],
};

// In-memory build state that behaves: formats and options change the file, a recheck finds the reseated sensor.
export function createBuildFixture(): BuildPort {
  let plan = EXPORT_PLAN;
  let hardware = HARDWARE;
  const fileFor = (format: ExportFormat) => ({
    ...plan.file,
    name: plan.file.name.replace(/\.[a-z]+$/, `.${EXTENSIONS[format]}`),
  });
  const settle = (sensor: string, change: (reading: SensorReading) => SensorReading | null) => {
    const readings = hardware.calibration.readings.flatMap((reading) => {
      if (reading.name !== sensor) {
        return [reading];
      }
      const next = change(reading);
      return next ? [next] : [];
    });
    const problem = readings.every((reading) => reading.ok) ? null : hardware.calibration.problem;
    hardware = { ...hardware, calibration: { ...hardware.calibration, readings, problem } };
    return hardware;
  };
  return {
    listTargets: async () => [...TARGETS],
    getExportPlan: async () => plan,
    setExportFormat: async ({ format }) => {
      plan = { ...plan, format, file: fileFor(format) };
      return plan;
    },
    setExportOption: async ({ id, on }: { id: ExportOptionId; on: boolean }) => {
      plan = { ...plan, options: plan.options.map((option) => (option.id === id ? { ...option, on } : option)) };
      return plan;
    },
    downloadExport: async () => undefined,
    getHardware: async () => hardware,
    recheckSensor: async ({ sensor }) =>
      settle(sensor, (reading) => ({ ...reading, meters: 0.42, fraction: 0.14, ok: true })),
    skipSensor: async ({ sensor }) => settle(sensor, () => null),
  };
}
