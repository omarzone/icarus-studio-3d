import type { SceneDescription } from "@icarus/contracts";
import { pending } from "../app/runtime/pending.ts";
import { definePort } from "../app/runtime/port.tsx";
import { createTrainingFixture } from "./training.fixture.ts";
import { createEngineTrainingPort } from "./training-engine.ts";

// Training runs of a project: live progress, metrics, starting, pausing and stopping, and the autopilot.

export type RunStatus = "running" | "paused" | "done" | "stopped" | "failed";

export type RunSummary = {
  id: string;
  name: string;
  status: RunStatus;
  // Share done while it runs, from 0 to 1.
  progress?: number;
  // One-line result ("16 lots · parks 71%").
  detail: string;
};

export type RunList = { selected: string; runs: readonly RunSummary[] };

export type Tone = "ok" | "warn" | "danger" | "neutral";

// A metric over the run so far: current value, its change, and the samples of its curve.
export type MetricSeries = {
  label: string;
  value: string;
  change: { text: string; tone: Tone };
  // "primary" for the main series, "danger" for failure-type series.
  meaning: "primary" | "danger";
  samples: readonly number[];
  // Range of the samples' axis.
  min: number;
  max: number;
};

export type RewardTerm = {
  label: string;
  value: string;
  ratio: number;
  // Main terms are white, smaller ones dimmer; penalties amber or red.
  tone: "main" | "minor" | "warn" | "danger";
};

export type LiveMetrics = {
  // Steps done and speed ("312k / 1M · 1,840 steps/s").
  progress: string;
  series: readonly MetricSeries[];
  breakdown: { title: string; terms: readonly RewardTerm[] };
};

export type ConsoleLine = { time: string; text: string; level: "info" | "warn" | "error" };

// What the live view shows over the parallel copies: the current checkpoint and, when recorded, the latest episode.
export type LiveView = {
  caption: string;
  checkpoint: string;
  result: string;
  episode?: { at: string; length: string; played: number; failureAt?: number };
  speed: string;
};

export type StartPlan = {
  // Name of the run it starts ("run 4").
  run: string;
  intro: string;
  steps: number;
  copies: number;
  // Estimates say so ("about 42 min").
  estimate: string;
  threads: string;
  coach: boolean;
};

export type StopSummary = { run: string; intro: string; keeps: readonly string[] };

export type AutopilotMode = "off" | "ask" | "fix";

export type AutopilotSettings = {
  intro: string;
  mode: AutopilotMode;
  options: readonly { mode: AutopilotMode; label: string; detail: string }[];
};

// A run that stopped by itself: why, what is safe, and the technical details.
export type RunFailure = { title: string; reason: string; details: readonly string[]; lastGoodRun: string };

// Where a geom is, in MuJoCo axes (quaternion wxyz); poses are by geom name.
export type CopyPose = { position: [number, number, number]; quaternion: [number, number, number, number] };
export type CopyPoses = ReadonlyMap<string, CopyPose>;

// The parallel copies of the selected run as the engine samples them while it trains.
export type LiveCopies =
  | { kind: "connecting" }
  | { kind: "message"; title: string; body: string }
  | { kind: "live"; scene: SceneDescription; step: string; copies: readonly CopyPoses[]; note?: string }
  | { kind: "closed"; reason: string };

// What changed in a run, so the views that show it read it again.
export type TrainingChange = "runs" | "metrics" | "checkpoints" | "console" | "live-view";

export type TrainingListener = {
  onLive: (live: LiveCopies) => void;
  onChange: (changes: readonly TrainingChange[]) => void;
  // The watched run stopped by itself.
  onFailed: () => void;
};

export type CheckpointMark = { step: number; label: string; result: string; best: boolean; replayable: boolean };

export type ReplayFrame = { time: number; poses: CopyPoses };

// A checkpoint's recorded episode, replayed exactly as MuJoCo computed it.
export type Replay = {
  scene: SceneDescription;
  label: string;
  outcome: string;
  // Seconds from the first frame to the last.
  duration: number;
  frames: readonly ReplayFrame[];
};

export type TrainingPort = {
  listRuns: (project: string) => Promise<RunList>;
  selectRun: (input: { project: string; id: string }) => Promise<RunList>;
  getLiveView: (project: string) => Promise<LiveView>;
  getMetrics: (project: string) => Promise<LiveMetrics>;
  getConsole: (project: string) => Promise<ConsoleLine[]>;
  getStartPlan: (project: string) => Promise<StartPlan>;
  updateStartPlan: (input: { project: string; steps?: number; copies?: number; coach?: boolean }) => Promise<StartPlan>;
  startRun: (project: string) => Promise<RunList>;
  getStopSummary: (project: string) => Promise<StopSummary>;
  pauseRun: (project: string) => Promise<RunList>;
  stopRun: (project: string) => Promise<RunList>;
  getAutopilot: (project: string) => Promise<AutopilotSettings>;
  setAutopilot: (input: { project: string; mode: AutopilotMode }) => Promise<AutopilotSettings>;
  getFailure: (project: string) => Promise<RunFailure>;
  // Streams the selected run while the Train workspace is open; the returned function disconnects.
  watch: (project: string, listener: TrainingListener) => () => void;
  getCheckpoints: (project: string) => Promise<CheckpointMark[]>;
  getReplay: (input: { project: string; step: number }) => Promise<Replay>;
};

export const trainingPort = definePort<TrainingPort>({
  app: {
    ...createEngineTrainingPort(),
    pauseRun: pending({ key: "training.pause", summary: "Pausing a training run", sprint: 8, ids: ["MOD-STOP-RUN"] }),
    getAutopilot: pending({
      key: "training.autopilot",
      summary: "What the copilot may change while training",
      sprint: 7,
      ids: ["MOD-AUTOPILOT"],
    }),
    setAutopilot: pending({
      key: "training.setAutopilot",
      summary: "Choosing what the copilot may change while training",
      sprint: 7,
      ids: ["MOD-AUTOPILOT"],
    }),
  },
  prototype: createTrainingFixture,
});
