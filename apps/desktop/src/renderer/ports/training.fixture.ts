import type {
  AutopilotSettings,
  ConsoleLine,
  LiveMetrics,
  LiveView,
  RunFailure,
  RunList,
  RunSummary,
  StartPlan,
  StopSummary,
  TrainingPort,
} from "./training-port.ts";

// Sample training data from the design (Park Pilot, run 3 at 31%), for the prototype and tests only.
const RUNS: readonly RunSummary[] = [
  { id: "run-3", name: "Run 3", status: "running", progress: 0.31, detail: "16 lots · parks 71%" },
  { id: "run-2", name: "Run 2", status: "done", detail: "parks 44% · 1M steps" },
  { id: "run-1", name: "Run 1", status: "stopped", detail: "parks 9% · 400k steps" },
];

const METRICS: LiveMetrics = {
  progress: "312k / 1M · 1,840 steps/s",
  series: [
    {
      label: "Mean reward",
      value: "184.2",
      change: { text: "+38%", tone: "ok" },
      meaning: "primary",
      samples: [4, 6, 12, 22, 38, 60, 88, 118, 146, 166, 178, 184.2],
      min: 0,
      max: 200,
    },
    {
      label: "Collision rate",
      value: "62%",
      change: { text: "high", tone: "danger" },
      meaning: "danger",
      samples: [90, 89, 87, 84, 80, 76, 72, 68, 65, 63, 62.5, 62],
      min: 0,
      max: 100,
    },
  ],
  breakdown: {
    title: "Reward breakdown · v3",
    terms: [
      { label: "Park in the spot", value: "2.50", ratio: 0.78, tone: "main" },
      { label: "Get closer", value: "1.00", ratio: 0.46, tone: "minor" },
      { label: "Touching cars", value: "0.2 → 1.0", ratio: 0.3, tone: "warn" },
      { label: "Energy used", value: "−0.05", ratio: 0.06, tone: "danger" },
    ],
  },
};

const CONSOLE: readonly ConsoleLine[] = [
  { time: "14:02:11", text: "run 3 started · PPO · 16 copies · seed 3", level: "info" },
  { time: "14:04:40", text: "checkpoint 100k saved · parks 12%", level: "info" },
  { time: "14:07:02", text: "checkpoint 250k saved · parks 71%", level: "info" },
  { time: "14:08:15", text: "collision rate above 60% in 7 of 16 lots", level: "warn" },
];

const LIVE_VIEW: LiveView = {
  caption: "Live training · 16 parking lots",
  checkpoint: "Checkpoint 312k",
  result: "Parks 71% · scrapes a car in 38%",
  episode: { at: "0:00.9", length: "0:01.6", played: 0.58, failureAt: 0.86 },
  speed: "0.5×",
};

const PLAN: StartPlan = {
  run: "run 4",
  intro: "Icarus will practice in 16 parking lots at once. You can keep editing and chatting while it trains.",
  steps: 1_000_000,
  copies: 16,
  estimate: "about 42 min",
  threads: "10 of 12 CPU threads",
  coach: true,
};

const STOP: StopSummary = {
  run: "run 3",
  intro: "Run 3 is at 312k of 1M steps. Its best brain so far parks 71% of the time.",
  keeps: ["Keep the best checkpoint (312k)", "Keep the timelapse and metrics"],
};

const AUTOPILOT: AutopilotSettings = {
  intro: "The coach watches test runs with vision every 50k steps and explains what it sees.",
  mode: "ask",
  options: [
    { mode: "off", label: "Off", detail: "Train exactly as set up" },
    { mode: "ask", label: "Ask first", detail: "It proposes a change and waits for your OK" },
    { mode: "fix", label: "Fix on its own", detail: "Up to 3 changes per run, each saved as a new version" },
  ],
};

const FAILURE: RunFailure = {
  title: "Run 4 stopped at 41k steps",
  reason:
    "The physics went unstable: a wheel spun so fast the simulation could not keep up. Nothing was lost. The best brain from run 3 is safe.",
  details: ["step 41,208 · lot 7 · wheel_rear_left angular velocity 1.2e5 rad/s", "worker exit: unstable simulation"],
  lastGoodRun: "run 3",
};

// In-memory runs that behave: selecting selects, pausing pauses, stopping stops, starting adds a run.
export function createTrainingFixture(): TrainingPort {
  let list: RunList = { selected: "run-3", runs: RUNS };
  let plan = PLAN;
  let autopilot = AUTOPILOT;
  const setStatus = (status: RunSummary["status"]) => {
    list = {
      ...list,
      runs: list.runs.map((run) => (run.id === list.selected ? { ...run, status, progress: undefined } : run)),
    };
    return list;
  };
  return {
    listRuns: async () => list,
    selectRun: async ({ id }) => {
      list = { ...list, selected: id };
      return list;
    },
    getLiveView: async () => LIVE_VIEW,
    getMetrics: async () => METRICS,
    getConsole: async () => [...CONSOLE],
    getStartPlan: async () => plan,
    updateStartPlan: async ({ steps, copies, coach }) => {
      plan = { ...plan, steps: steps ?? plan.steps, copies: copies ?? plan.copies, coach: coach ?? plan.coach };
      return plan;
    },
    startRun: async () => {
      const id = `run-${list.runs.length + 1}`;
      const run: RunSummary = {
        id,
        name: `Run ${list.runs.length + 1}`,
        status: "running",
        progress: 0,
        detail: "starting",
      };
      list = { selected: id, runs: [run, ...list.runs] };
      return list;
    },
    getStopSummary: async () => STOP,
    pauseRun: async () => setStatus("paused"),
    stopRun: async () => setStatus("stopped"),
    getAutopilot: async () => autopilot,
    setAutopilot: async ({ mode }) => {
      autopilot = { ...autopilot, mode };
      return autopilot;
    },
    getFailure: async () => FAILURE,
  };
}
