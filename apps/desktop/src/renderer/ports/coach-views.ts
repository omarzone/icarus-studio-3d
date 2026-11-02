import type { AutopilotStart, AutopilotStatus, CopilotProposal, Diagnosis, FailureGroup } from "@icarus/contracts";
import { compactNumber } from "../ui/compact-number.ts";
import type { DiagnosisView, FailureReplay, Failures, Tone } from "./results-port.ts";
import type { AutopilotLimits, AutopilotMode, AutopilotProgress, AutopilotSettings } from "./training-port.ts";
import { percent } from "./training-views.ts";

// Pure mappings from the coach's documents (failure groups, diagnoses, autopilot status) onto the view types.

type FrameUrl = (attachmentId: string) => string;

const LOG_LINES = 5;

const share = (group: FailureGroup) => `${percent(group.share)} of test runs`;

const chosen = (groups: readonly FailureGroup[], selected: string | undefined) =>
  selected !== undefined && groups[Number(selected)] ? selected : "0";

export function failuresView(
  groups: readonly FailureGroup[],
  source: string,
  selected: string | undefined,
  frameUrl: FrameUrl,
): Failures {
  return {
    total: source,
    selected: chosen(groups, selected),
    groups: groups.map((group, index) => {
      const first = group.frame_attachment_ids?.[0];
      const base = { id: String(index), title: group.label, count: share(group) };
      return first === undefined ? base : { ...base, frame: frameUrl(first) };
    }),
  };
}

export function failureReplay(
  groups: readonly FailureGroup[],
  selected: string | undefined,
  source: string,
  frameUrl: FrameUrl,
): FailureReplay {
  const group = groups[Number(chosen(groups, selected))];
  const base = { watched: `Evaluation of ${source}`, at: "", played: 0 };
  if (!group) {
    return { ...base, note: { title: "No failure groups yet", detail: "" }, run: "", frames: [], empty: true };
  }
  return {
    ...base,
    note: { title: group.label, detail: group.description },
    run: share(group),
    frames: (group.frame_attachment_ids ?? []).map((id) => ({ id, url: frameUrl(id) })),
  };
}

export function latestDiagnosis(diagnoses: readonly Diagnosis[]): Diagnosis | undefined {
  return diagnoses.reduce<Diagnosis | undefined>(
    (latest, item) =>
      latest === undefined || Date.parse(item.created_at) > Date.parse(latest.created_at) ? item : latest,
    undefined,
  );
}

const NEXT_STEPS: Readonly<Record<Diagnosis["next_step"], { label: string; tone: Tone }>> = {
  keep_training: { label: "Keep training", tone: "neutral" },
  stop_and_fix: { label: "Stop and fix", tone: "warn" },
  done: { label: "Done", tone: "ok" },
};

export function diagnosisView(
  diagnosis: Diagnosis,
  runName: string,
  proposals: readonly CopilotProposal[],
): DiagnosisView {
  const id = diagnosis.proposal_id;
  const found = proposals.find((item) => item.id === id);
  return {
    id: diagnosis.id,
    title: `${runName} · checkpoint ${compactNumber(diagnosis.step)}`,
    createdAt: diagnosis.created_at,
    summary: diagnosis.summary,
    hypothesis: diagnosis.hypothesis,
    observations: [...diagnosis.observations],
    nextStep: NEXT_STEPS[diagnosis.next_step],
    proposal: id ? { id, summary: found?.summary ?? "The proposed fix", status: found?.status ?? "open" } : null,
  };
}

function stateWords(status: AutopilotStatus): { label: string; tone: Tone } {
  switch (status.state) {
    case "running":
      return { label: "Running", tone: "ok" };
    case "waiting_approval":
      return { label: "Waiting for your approval", tone: "warn" };
    case "done":
      return (status.best_success ?? 0) >= status.goal_success
        ? { label: "Reached the goal", tone: "ok" }
        : { label: "Finished without the goal", tone: "neutral" };
    case "stopped":
      return { label: "Stopped", tone: "neutral" };
    case "failed":
      return { label: "Failed", tone: "danger" };
  }
}

export function autopilotProgress(status: AutopilotStatus): AutopilotProgress {
  const words = stateWords(status);
  const active = status.state === "running" || status.state === "waiting_approval";
  const tries = `try ${status.iteration} of ${status.max_iterations}`;
  const best = status.best_success == null ? "no success measured yet" : `best success ${percent(status.best_success)}`;
  const first = status.log.length - LOG_LINES;
  return {
    active,
    ...words,
    chip: active ? `Autopilot · ${tries}` : `Autopilot · ${words.label.toLowerCase()}`,
    detail: `Try ${status.iteration} of ${status.max_iterations} · ${best} · goal ${percent(status.goal_success)}`,
    log: status.log.slice(-LOG_LINES).map((line, index) => ({
      id: String(Math.max(first, 0) + index),
      time: line.time,
      text: line.text,
    })),
  };
}

export type AutopilotChoice = { mode: AutopilotMode; limits: AutopilotLimits };

export const DEFAULT_AUTOPILOT: AutopilotChoice = { mode: "ask", limits: { goal: 0.8, iterations: 4, minutes: 60 } };

const OPTIONS: AutopilotSettings["options"] = [
  { mode: "off", label: "Off", detail: "Train exactly as set up" },
  { mode: "ask", label: "Ask first", detail: "It diagnoses at checkpoints, proposes a fix and waits for your OK" },
  { mode: "fix", label: "Fix on its own", detail: "It applies fixes, trains again and keeps the best brain" },
];

export function autopilotSettings(status: AutopilotStatus | null, choice: AutopilotChoice): AutopilotSettings {
  const progress = status ? autopilotProgress(status) : null;
  const running = status !== null && progress?.active === true;
  return {
    intro: "The coach watches each run's evaluations and frames, explains what goes wrong and proposes fixes.",
    mode: running ? status.mode : choice.mode,
    options: OPTIONS,
    limits: running
      ? { goal: status.goal_success, iterations: status.max_iterations, minutes: choice.limits.minutes }
      : choice.limits,
    progress,
  };
}

export function autopilotStart(choice: AutopilotChoice): AutopilotStart {
  if (choice.mode === "off") {
    throw new Error("Choose Ask first or Fix on its own to start the autopilot");
  }
  return {
    mode: choice.mode,
    goal_success: choice.limits.goal,
    max_iterations: choice.limits.iterations,
    max_minutes: choice.limits.minutes,
  };
}

function within(value: number | undefined, fallback: number, min: number, max: number, whole: boolean): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  const rounded = whole ? Math.round(value) : Math.round(value * 100) / 100;
  return Math.min(max, Math.max(min, rounded));
}

// The engine accepts a goal above 0 up to 1, 1 to 12 tries and 5 to 600 minutes.
export function limitsWith(current: AutopilotLimits, patch: Partial<AutopilotLimits>): AutopilotLimits {
  return {
    goal: within(patch.goal, current.goal, 0.05, 1, false),
    iterations: within(patch.iterations, current.iterations, 1, 12, true),
    minutes: within(patch.minutes, current.minutes, 5, 600, true),
  };
}
