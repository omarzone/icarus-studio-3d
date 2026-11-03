import type { CheckpointInfo, LogLine, Rollout, RunStatus, StartRun, TrainingSettings } from "@icarus/contracts";
import { compactNumber } from "../ui/compact-number.ts";
import type {
  ConsoleLine,
  LiveView,
  RunFailure,
  RunList,
  RunSummary,
  StartPlan,
  StopSummary,
} from "./training-port.ts";

// Pure mappings from the engine's training documents onto the Train view types.

type TaskFamily = "none" | "navigation" | "locomotion" | "imitation";

const FINAL: readonly RunStatus["state"][] = ["done", "stopped", "failed"];

// ADR 001: about 2,000 steps per second on 16 copies; fewer copies train proportionally slower.
const STEPS_PER_SECOND_ON_16 = 2000;
const MIN_STEPS = 10_000;
const MAX_STEPS = 50_000_000;
const MAX_COPIES = 64;

export const percent = (share: number): string => `${Math.round(share * 100)}%`;

export function signed(value: number, digits = 1): string {
  const text = Math.abs(value).toFixed(digits);
  return value < 0 && Number(text) !== 0 ? `−${text}` : text;
}

const lower = (name: string): string => name.charAt(0).toLowerCase() + name.slice(1);

export const isFinal = (run: RunStatus): boolean => FINAL.includes(run.state);

export function activeRun(runs: readonly RunStatus[]): RunStatus | undefined {
  return runs.find((run) => !isFinal(run));
}

function runDetail(run: RunStatus): string {
  const steps = compactNumber(run.step);
  const success = run.success_rate == null ? null : `success ${percent(run.success_rate)}`;
  switch (run.state) {
    case "starting":
    case "stopping":
      return run.state;
    case "running": {
      const where = `${steps} of ${compactNumber(run.total_steps)} steps`;
      const detail = success ? `${success} · ${where}` : where;
      return run.paused ? `paused · ${detail}` : detail;
    }
    case "done":
    case "stopped":
      return success ? `${success} · ${steps} steps` : `${steps} steps`;
    case "failed":
      return `failed at ${steps} steps`;
  }
}

function viewStatus(state: RunStatus["state"]): RunSummary["status"] {
  switch (state) {
    case "starting":
    case "running":
    case "stopping":
      return "running";
    case "done":
    case "stopped":
    case "failed":
      return state;
  }
}

export function runSummary(run: RunStatus): RunSummary {
  const status = run.paused && run.state === "running" ? "paused" : viewStatus(run.state);
  const summary: RunSummary = { id: run.run_id, name: run.name, status, detail: runDetail(run) };
  if (status === "running" || status === "paused") {
    summary.progress = run.total_steps > 0 ? Math.min(1, run.step / run.total_steps) : 0;
  }
  return summary;
}

// Runs newest first; the chosen run stays selected while it exists, else the newest is.
export function runList(runs: readonly RunStatus[], selected: string | undefined): RunList {
  const chosen = runs.find((run) => run.run_id === selected) ?? runs[0];
  return { selected: chosen?.run_id ?? "", runs: runs.map(runSummary) };
}

export type PlanChoice = { steps?: number; copies?: number; coach?: boolean };

type PlanInput = {
  // How many runs the project has, so the plan names the next one.
  runs: number;
  family: TaskFamily;
  settings: Pick<TrainingSettings, "threads" | "max_threads">;
  choice: PlanChoice;
  // The brain's own practice: its default steps (none for the task's recommended budget) and copies.
  brain?: { steps?: number | null; copies: number };
};

// Mirrors the engine's RECOMMENDED_STEPS: the budget a task family needs before its results say much.
export function recommendedSteps(family: TaskFamily): number {
  return family === "locomotion" || family === "imitation" ? 2_000_000 : 1_000_000;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)));

function duration(seconds: number): string {
  if (seconds < 60) {
    return "under a minute";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function startPlan({ runs, family, settings, choice, brain }: PlanInput): StartPlan {
  const steps = clamp(choice.steps ?? brain?.steps ?? recommendedSteps(family), MIN_STEPS, MAX_STEPS);
  const copies = clamp(choice.copies ?? brain?.copies ?? 16, 1, MAX_COPIES);
  const seconds = (steps / STEPS_PER_SECOND_ON_16) * Math.max(1, 16 / copies);
  const time = duration(seconds);
  // Walking bodies have not been measured yet, so their estimate says it is rough.
  const estimate =
    time === "under a minute"
      ? time
      : `${family === "locomotion" || family === "imitation" ? "roughly" : "about"} ${time}`;
  return {
    run: `run ${runs + 1}`,
    intro: [
      "Training is practice: the brain tries over and over and keeps what earns rewards.",
      `It will practice ${compactNumber(steps)} steps (one step is one moment of practice) in ${copies} ${copies === 1 ? "copy" : "copies"} of the world at once; more copies finish sooner but use more of your computer.`,
      "You can keep editing and chatting meanwhile, and Play then uses the best brain it found.",
    ].join(" "),
    steps,
    copies,
    estimate,
    threads: `${settings.threads} of ${settings.max_threads} CPU threads`,
    // The copilot coaches every run unless the person turns it off.
    coach: choice.coach ?? true,
  };
}

export function startRequest(plan: StartPlan): StartRun {
  return { total_steps: plan.steps, copies: plan.copies, coach: plan.coach };
}

export function checkpointResult(checkpoint: CheckpointInfo): string {
  if (checkpoint.success_rate == null) {
    return `Return ${signed(checkpoint.episode_return)}`;
  }
  const fails = checkpoint.failure_rate == null ? "" : ` · fails ${percent(checkpoint.failure_rate)}`;
  return `Success ${percent(checkpoint.success_rate)}${fails}`;
}

// Episode time as the playback bar shows it: minutes, seconds and tenths.
function episodeClock(seconds: number): string {
  const tenths = Math.round(Math.max(0, seconds) * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = ((tenths % 600) / 10).toFixed(1).padStart(4, "0");
  return `${minutes}:${rest}`;
}

export function liveView(run: RunStatus, checkpoints: readonly CheckpointInfo[], rollout?: Rollout): LiveView {
  const latest = checkpoints.at(-1);
  const view: LiveView = {
    caption: isFinal(run) ? `${run.name} · ${run.state}` : `Live training · ${run.copies} copies`,
    checkpoint: latest ? `Checkpoint ${compactNumber(latest.step)}` : "No checkpoint yet",
    result: latest ? checkpointResult(latest) : "The first one is saved at step 0",
    speed: `${Math.round(run.steps_per_second).toLocaleString("en-US")} steps/s`,
  };
  const first = rollout?.frames[0]?.time;
  const last = rollout?.frames.at(-1)?.time;
  if (rollout && first !== undefined && last !== undefined) {
    view.episode = { step: rollout.step, at: episodeClock(0), length: episodeClock(last - first), played: 0 };
  }
  return view;
}

function clock(elapsed: number): string {
  const total = Math.floor(elapsed);
  const minutes = Math.floor(total / 60) % 60;
  const seconds = total % 60;
  return `${Math.floor(total / 3600)}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function consoleLines(lines: readonly LogLine[]): ConsoleLine[] {
  return lines.map((line) => ({ time: clock(line.elapsed), text: line.text, level: line.level }));
}

export function stopSummary(run: RunStatus, checkpoints: readonly CheckpointInfo[]): StopSummary {
  const where = `${run.name} is at ${compactNumber(run.step)} of ${compactNumber(run.total_steps)} steps.`;
  const best = checkpoints.find((checkpoint) => checkpoint.step === run.best_step);
  const result = !best
    ? "It has no checkpoint yet."
    : best.success_rate == null
      ? `Its best brain so far scores ${signed(best.episode_return)}.`
      : `Its best brain so far reaches the goal ${percent(best.success_rate)} of the time.`;
  const keeps = ["Save a checkpoint at the current step"];
  if (best) {
    keeps.push(`Keep the best checkpoint (${compactNumber(best.step)})`);
  }
  keeps.push("Keep the metrics and replays");
  const held = run.paused ? " It is paused, holding its brain and copies where they were." : "";
  return { run: lower(run.name), intro: `${where} ${result}${held}`, keeps, paused: Boolean(run.paused) };
}

// Only a best checkpoint past step 0 holds a trained brain worth promising.
function keptBrain(best: number | null | undefined): string {
  return typeof best === "number" && best > 0
    ? `Its best brain (checkpoint ${compactNumber(best)}) is kept and can be used in Play.`
    : "No checkpoint was saved, so there is no brain to keep.";
}

export function failureView(run: RunStatus, runs: readonly RunStatus[]): RunFailure {
  const good = runs.find((other) => other.state === "done" || other.state === "stopped");
  return {
    title: `${run.name} stopped at ${compactNumber(run.step)} steps`,
    reason: `${run.failure?.reason ?? "The run stopped without a reason."} ${keptBrain(run.best_step)}`,
    details: run.failure?.details ?? [],
    lastGoodRun: good ? lower(good.name) : "results",
  };
}
