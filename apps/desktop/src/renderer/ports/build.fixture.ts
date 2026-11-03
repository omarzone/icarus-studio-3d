import type {
  BuildPort,
  BuildTarget,
  ExportFormat,
  ExportOptionId,
  ExportPlan,
  HardwareCheckRow,
  HardwareSession,
} from "./build-port.ts";
import { EXPORT_FORMATS, EXPORT_OPTIONS, rowNeedingAttention } from "./build-views.ts";

// Sample data from the design, used only by the prototype, the design gallery and tests.
const TARGETS: readonly BuildTarget[] = [
  { kind: "community", detail: "Publish so others can remix it" },
  { kind: "export-brain", detail: "ONNX file · 1.2 MB" },
  { kind: "hardware", detail: "Parts list · about $189" },
  { kind: "game", detail: "Unity · Godot · Roblox" },
  { kind: "animation", detail: "glTF · FBX (for dancers)" },
];

const FILES: Readonly<Record<ExportFormat, ExportPlan["files"]>> = {
  onnx: [{ path: "brain.onnx", bytes: 1_200_000, description: "The trained brain as an ONNX graph" }],
  urdf: [{ path: "robot.urdf", bytes: 14_200, description: "The body as a URDF robot" }],
  mjcf: [{ path: "scene.xml", bytes: 48_600, description: "The body and its world as a MuJoCo model" }],
  package: [
    { path: "brain.onnx", bytes: 1_200_000, description: "The trained brain as an ONNX graph" },
    { path: "robot.urdf", bytes: 14_200, description: "The body as a URDF robot" },
    { path: "scene.xml", bytes: 48_600, description: "The body and its world as a MuJoCo model" },
  ],
};

const OPTION_FILES: Readonly<Record<ExportOptionId, ExportPlan["files"][number]>> = {
  spec: { path: "brain.json", bytes: 3_400, description: "Every input and output of the brain" },
  runtime: { path: "README.md", bytes: 5_100, description: "How to run the export" },
  parts: { path: "parts.csv", bytes: 300, description: "Parts with approximate prices" },
  history: { path: "training.csv", bytes: 42_000, description: "Training and evaluation points" },
};

const ROWS: readonly HardwareCheckRow[] = [
  { name: "Front L", meters: "1.21 / 4.00 m", fraction: 0.3 },
  { name: "Front", meters: "2.08 / 4.00 m", fraction: 0.52 },
  { name: "Front R", meters: "1.97 / 4.00 m", fraction: 0.49 },
  { name: "Side L", meters: "0.36 / 4.00 m", fraction: 0.09 },
  { name: "Side R", meters: "6.00 / 4.00 m", fraction: 1 },
  { name: "Rear L", meters: "1.55 / 4.00 m", fraction: 0.39 },
].map(
  ({ name, meters, fraction }): HardwareCheckRow => ({
    id: name,
    name,
    hardware: "Time-of-flight distance sensor",
    reading: meters,
    fraction,
    status: fraction < 1 ? "pass" : "warn",
    gap: fraction < 1 ? "Inside its range." : "Objects beyond its range read as nothing.",
  }),
);

const PROBLEM = {
  title: "Side R needs attention.",
  fix: "Its ray reaches past the sensor's range: shorten it or skip it.",
};

const HARDWARE: HardwareSession = {
  kit: { id: "rc_car", name: "RC car", board: "Raspberry Pi 5" },
  verdict: "warn",
  steps: [
    { label: "Pick the hardware", status: "done" },
    { label: "Check joints and sensors", status: "current" },
    { label: "Export robot and brain", status: "todo" },
    { label: "Run it on the device", status: "todo" },
  ],
  check: {
    instructions: "Measured with Run 3 at step 312,000. Every joint and sensor against the kit's rated limits:",
    rows: ROWS,
    problem: PROBLEM,
  },
  safety: [
    "Limit top speed to 0.5 m/s for the first runs",
    "Start at half torque: the simulation has no backlash, battery sag or motor heat",
    "Keep a stop switch in reach; Icarus does not drive the device itself",
  ],
  parts: [
    { name: "Raspberry Pi 5", count: 1, usd: 60 },
    { name: "Distance sensors", count: 8, usd: 9 },
    { name: "RC chassis 1:16", count: 1, usd: 45 },
    { name: "Steering servo", count: 1, usd: 12 },
  ],
};

function planFor(format: ExportFormat, options: ReadonlySet<ExportOptionId>): ExportPlan {
  const files = [
    ...FILES[format],
    ...EXPORT_OPTIONS.filter(({ id }) => options.has(id)).map(({ id }) => OPTION_FILES[id]),
  ];
  return {
    formats: EXPORT_FORMATS,
    format,
    options: EXPORT_OPTIONS.map((option) => ({ ...option, on: options.has(option.id) })),
    name: "park-pilot-r3.zip",
    files,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    brain: { name: "Run 3 · step 312,000", inputs: 11, outputs: 3, rateHz: 20 },
    notes: [],
  };
}

// In-memory build state that behaves: formats and options change the files, skipping a part clears its problem.
export function createBuildFixture(): BuildPort {
  let format: ExportFormat = "onnx";
  let options = new Set<ExportOptionId>(["spec", "runtime"]);
  let hardware = HARDWARE;
  const settle = (rows: readonly HardwareCheckRow[]) => {
    const open = rowNeedingAttention(rows);
    hardware = {
      ...hardware,
      verdict: open ? hardware.verdict : "pass",
      check: { ...hardware.check, rows, problem: open ? PROBLEM : null },
    };
    return hardware;
  };
  return {
    listTargets: async () => [...TARGETS],
    getExportPlan: async () => planFor(format, options),
    setExportFormat: async ({ format: next }) => {
      format = next;
      return planFor(format, options);
    },
    setExportOption: async ({ id, on }) => {
      options = new Set(options);
      if (on) {
        options.add(id);
      } else {
        options.delete(id);
      }
      return planFor(format, options);
    },
    downloadExport: async () => {
      const plan = planFor(format, options);
      return { kind: "saved", path: plan.name, bytes: plan.totalBytes };
    },
    getHardware: async () => hardware,
    recheckPart: async () => hardware,
    skipPart: async ({ part }) =>
      settle(
        hardware.check.rows.map((row) => (row.id === part ? { ...row, status: "skipped", reading: "skipped" } : row)),
      ),
  };
}
