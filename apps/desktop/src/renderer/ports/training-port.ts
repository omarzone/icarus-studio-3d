import { pending } from "../app/runtime/pending.ts";
import { definePort } from "../app/runtime/port.tsx";
import { createTrainingFixture } from "./training.fixture.ts";

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

// What the live view shows over the parallel copies: the current checkpoint and the latest episode.
export type LiveView = {
  caption: string;
  checkpoint: string;
  result: string;
  episode: { at: string; length: string; played: number; failureAt?: number };
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
};

const trainIds = ["SCR-TRAIN", "MOD-STOP-RUN", "MOD-AUTOPILOT", "STA-TRAIN-FAILED"] as const;

export const trainingPort = definePort<TrainingPort>({
  app: {
    listRuns: pending({ key: "training.runs", summary: "The training runs", sprint: 5, ids: [...trainIds] }),
    selectRun: pending({ key: "training.selectRun", summary: "Selecting a run", sprint: 5, ids: [...trainIds] }),
    getLiveView: pending({
      key: "training.liveView",
      summary: "Watching the parallel copies train",
      sprint: 5,
      ids: [...trainIds],
    }),
    getMetrics: pending({ key: "training.metrics", summary: "Live training metrics", sprint: 5, ids: [...trainIds] }),
    getConsole: pending({ key: "training.console", summary: "The training log", sprint: 5, ids: [...trainIds] }),
    getStartPlan: pending({
      key: "training.plan",
      summary: "The cost of a training run",
      sprint: 5,
      ids: ["MOD-START-TRAINING"],
    }),
    updateStartPlan: pending({
      key: "training.updatePlan",
      summary: "Changing the steps and copies of a run",
      sprint: 5,
      ids: ["MOD-START-TRAINING"],
    }),
    startRun: pending({
      key: "training.start",
      summary: "Starting a training run",
      sprint: 5,
      ids: ["MOD-START-TRAINING"],
    }),
    getStopSummary: pending({
      key: "training.stopSummary",
      summary: "What stopping a run keeps",
      sprint: 5,
      ids: ["MOD-STOP-RUN"],
    }),
    pauseRun: pending({ key: "training.pause", summary: "Pausing a training run", sprint: 5, ids: ["MOD-STOP-RUN"] }),
    stopRun: pending({ key: "training.stop", summary: "Stopping a training run", sprint: 5, ids: ["MOD-STOP-RUN"] }),
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
    getFailure: pending({
      key: "training.failure",
      summary: "Why a run stopped by itself",
      sprint: 5,
      ids: ["STA-TRAIN-FAILED"],
    }),
  },
  prototype: createTrainingFixture,
});
