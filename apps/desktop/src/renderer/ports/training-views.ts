import type { CheckpointInfo, LogLine, RunStatus, StartRun, TrainingSettings } from "@icarus/contracts";
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

type TaskFamily = "none" | "navigation" | "locomotion";

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
      return success ? `${success} · ${where}` : where;
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
  const status = viewStatus(run.state);
  const summary: RunSummary = { id: run.run_id, name: run.name, status, detail: runDetail(run) };
  if (status === "running") {
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
};

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

export function startPlan({ runs, family, settings, choice }: PlanInput): StartPlan {
  const steps = clamp(choice.steps ?? (family === "locomotion" ? 2_000_000 : 1_000_000), MIN_STEPS, MAX_STEPS);
  const copies = clamp(choice.copies ?? 16, 1, MAX_COPIES);
  const seconds = (steps / STEPS_PER_SECOND_ON_16) * Math.max(1, 16 / copies);
  const time = duration(seconds);
  // Walking bodies have not been measured yet, so their estimate says it is rough.
  const estimate = time === "under a minute" ? time : `${family === "locomotion" ? "roughly" : "about"} ${time}`;
  return {
    run: `run ${runs + 1}`,
    intro: `Icarus will practice in ${copies} ${copies === 1 ? "copy" : "copies"} of the world at once. You can keep editing and chatting while it trains.`,
    steps,
    copies,
    estimate,
    threads: `${settings.threads} of ${settings.max_threads} CPU threads`,
    coach: choice.coach ?? false,
  };
}

export function startRequest(plan: StartPlan): StartRun {
  return { total_steps: plan.steps, copies: plan.copies };
}

export function checkpointResult(checkpoint: CheckpointInfo): string {
  if (checkpoint.success_rate == null) {
    return `Return ${signed(checkpoint.episode_return)}`;
  }
  const fails = checkpoint.failure_rate == null ? "" : ` · fails ${percent(checkpoint.failure_rate)}`;
  return `Success ${percent(checkpoint.success_rate)}${fails}`;
}

export function liveView(run: RunStatus, checkpoints: readonly CheckpointInfo[]): LiveView {
  const latest = checkpoints.at(-1);
  return {
    caption: isFinal(run) ? `${run.name} · ${run.state}` : `Live training · ${run.copies} copies`,
    checkpoint: latest ? `Checkpoint ${compactNumber(latest.step)}` : "No checkpoint yet",
    result: latest ? checkpointResult(latest) : "The first one is saved at step 0",
    speed: `${Math.round(run.steps_per_second).toLocaleString("en-US")} steps/s`,
  };
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
  return { run: lower(run.name), intro: `${where} ${result}`, keeps };
}

export function failureView(run: RunStatus, runs: readonly RunStatus[]): RunFailure {
  const good = runs.find((other) => other.state === "done" || other.state === "stopped");
  return {
    title: `${run.name} stopped at ${compactNumber(run.step)} steps`,
    reason: run.failure?.reason ?? "The run stopped without a reason.",
    details: run.failure?.details ?? [],
    lastGoodRun: good ? lower(good.name) : "results",
  };
}
