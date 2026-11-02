import type { CheckpointInfo, RunStatus } from "@icarus/contracts";
import { compactNumber } from "../ui/compact-number.ts";
import type {
  BestBrain,
  Checkpoint,
  CompareTable,
  Comparison,
  LearningHistory,
  ResultRun,
  ResultSummary,
  Tone,
} from "./results-port.ts";
import { percent, signed } from "./training-views.ts";

// Pure mappings from runs and their checkpoint evaluations onto the Results view types.

export type RunRecord = { run: RunStatus; checkpoints: readonly CheckpointInfo[] };

// The seed of the recorded evaluation episode at the compared checkpoint, null when it was not recorded.
export type ComparedRecord = RunRecord & { seeds: number | null };

const MAX_HISTORY = 8;
const COMMON_ROWS = 4;
const EVALUATION_NOTE = "Measured on fixed evaluation seeds, apart from the training episodes.";

const rank = (checkpoint: CheckpointInfo): [number, number] => [
  checkpoint.success_rate ?? 0,
  checkpoint.episode_return,
];

function better(a: CheckpointInfo, b: CheckpointInfo): boolean {
  const [successA, returnA] = rank(a);
  const [successB, returnB] = rank(b);
  return successA > successB || (successA === successB && returnA > returnB);
}

function ranked(checkpoints: readonly CheckpointInfo[]): CheckpointInfo | undefined {
  return checkpoints.reduce<CheckpointInfo | undefined>(
    (best, checkpoint) => (best === undefined || better(checkpoint, best) ? checkpoint : best),
    undefined,
  );
}

export function bestCheckpoint(record: RunRecord): CheckpointInfo | undefined {
  const named = record.checkpoints.find((checkpoint) => checkpoint.step === record.run.best_step);
  return named ?? ranked(record.checkpoints);
}

function score(checkpoint: CheckpointInfo | undefined): string {
  if (!checkpoint) {
    return "—";
  }
  return checkpoint.success_rate == null ? signed(checkpoint.episode_return) : percent(checkpoint.success_rate);
}

function runDetail(run: RunStatus): string {
  const steps = compactNumber(run.step);
  switch (run.state) {
    case "starting":
      return "Starting";
    case "running":
      return `Training · ${steps} of ${compactNumber(run.total_steps)} steps`;
    case "stopping":
      return `Stopping · ${steps} steps`;
    case "done":
      return `Done · ${steps} steps`;
    case "stopped":
      return `Stopped · ${steps} steps`;
    case "failed":
      return `Failed at ${steps} steps`;
  }
}

export function resultRuns(records: readonly RunRecord[], compared: readonly string[]): ResultRun[] {
  return records.map((record, index) => ({
    id: record.run.run_id,
    name: record.run.name,
    detail: runDetail(record.run),
    score: score(bestCheckpoint(record)),
    compared: compared.includes(record.run.run_id),
    current: index === 0,
  }));
}

export function defaultCompared(records: readonly RunRecord[]): string[] {
  return records
    .filter((record) => bestCheckpoint(record) !== undefined)
    .slice(0, 2)
    .map((record) => record.run.run_id);
}

// Two runs at most: choosing a third drops the one chosen first.
export function toggleCompared(compared: readonly string[], id: string): string[] {
  if (compared.includes(id)) {
    return compared.filter((item) => item !== id);
  }
  return [...compared, id].slice(-2);
}

export function bestBrains(records: readonly RunRecord[]): BestBrain[] {
  return records.flatMap((record) => {
    const best = bestCheckpoint(record);
    return best
      ? [{ id: record.run.run_id, run: record.run.name, checkpoint: compactNumber(best.step), score: score(best) }]
      : [];
  });
}

function checkpointWords(checkpoint: CheckpointInfo): string {
  const result = `return ${signed(checkpoint.episode_return)}`;
  return checkpoint.success_rate == null ? result : `success ${percent(checkpoint.success_rate)} · ${result}`;
}

export function bestSummary(records: readonly RunRecord[]): ResultSummary {
  let best: { record: RunRecord; checkpoint: CheckpointInfo } | undefined;
  for (const record of records) {
    const checkpoint = bestCheckpoint(record);
    if (checkpoint && (best === undefined || better(checkpoint, best.checkpoint))) {
      best = { record, checkpoint };
    }
  }
  if (!best) {
    return {
      kind: "empty",
      title: "No brain yet",
      detail: "The best brain appears once a run evaluates a checkpoint.",
    };
  }
  const where = `${best.record.run.name} · checkpoint ${compactNumber(best.checkpoint.step)}`;
  return { kind: "best", title: "Best brain so far", detail: `${where} · ${checkpointWords(best.checkpoint)}` };
}

export function scoreSummary(record: RunRecord | undefined, step: number | undefined): ResultSummary {
  const checkpoint = record?.checkpoints.find((item) => item.step === step) ?? (record && bestCheckpoint(record));
  if (!record || !checkpoint) {
    return { kind: "empty", title: "No evaluation yet", detail: "Scores appear after the first checkpoint." };
  }
  const scores = [
    ...(checkpoint.success_rate == null
      ? []
      : [
          {
            label: "Succeeds",
            value: percent(checkpoint.success_rate),
            ratio: checkpoint.success_rate,
            tone: "ok" as const,
          },
        ]),
    ...(checkpoint.failure_rate == null
      ? []
      : [
          {
            label: "Fails",
            value: percent(checkpoint.failure_rate),
            ratio: checkpoint.failure_rate,
            tone: "danger" as const,
          },
        ]),
  ];
  return {
    kind: "scores",
    title: `${record.run.name} · checkpoint ${compactNumber(checkpoint.step)}`,
    scores,
    note: `Return ${signed(checkpoint.episode_return)}. ${EVALUATION_NOTE}`,
  };
}

// First, last, best and evenly spaced checkpoints in between, so a long run stays readable.
function sampled(checkpoints: readonly CheckpointInfo[], best: number | undefined): CheckpointInfo[] {
  if (checkpoints.length <= MAX_HISTORY) {
    return [...checkpoints];
  }
  const keep = new Set<number>([0, checkpoints.length - 1]);
  const bestIndex = checkpoints.findIndex((item) => item.step === best);
  if (bestIndex >= 0) {
    keep.add(bestIndex);
  }
  for (let slot = 1; keep.size < MAX_HISTORY && slot < MAX_HISTORY - 1; slot += 1) {
    keep.add(Math.round((slot * (checkpoints.length - 1)) / (MAX_HISTORY - 1)));
  }
  return [...keep]
    .sort((a, b) => a - b)
    .slice(0, MAX_HISTORY)
    .flatMap((index) => checkpoints[index] ?? []);
}

export function learningHistory(record: RunRecord | undefined): LearningHistory {
  if (!record) {
    return { training: false, checkpoints: [] };
  }
  const best = bestCheckpoint(record)?.step;
  const checkpoints: Checkpoint[] = sampled(record.checkpoints, best).map((checkpoint) => ({
    id: String(checkpoint.step),
    reached: true,
    step: compactNumber(checkpoint.step),
    label: score(checkpoint),
    detail: `return ${checkpoint.episode_return.toFixed(1)}`,
    current: checkpoint.step === best,
  }));
  const training = ["starting", "running", "stopping"].includes(record.run.state);
  return { training, checkpoints };
}

function basis(sides: readonly ComparedRecord[]): string {
  const seeds = sides.map((side) => side.seeds);
  if (seeds.some((seed) => seed === null)) {
    return "Seeds not recorded";
  }
  return new Set(seeds).size === 1 ? "Same seeds" : "Different seeds";
}

function compareTable(a: ComparedRecord, b: ComparedRecord): CompareTable {
  const bestA = bestCheckpoint(a);
  const bestB = bestCheckpoint(b);
  const pair = (read: (record: RunRecord, best: CheckpointInfo | undefined) => string): readonly [string, string] => [
    read(a, bestA),
    read(b, bestB),
  ];
  const stepsB = new Map(b.checkpoints.map((checkpoint) => [checkpoint.step, checkpoint]));
  const common = a.checkpoints.filter((checkpoint) => stepsB.has(checkpoint.step)).slice(-COMMON_ROWS);
  return {
    columns: [a.run.name, b.run.name],
    rows: [
      {
        label: "Best success",
        values: pair((_, best) => (best?.success_rate == null ? "—" : percent(best.success_rate))),
      },
      { label: "Best return", values: pair((_, best) => (best ? signed(best.episode_return) : "—")) },
      { label: "Best checkpoint", values: pair((_, best) => (best ? compactNumber(best.step) : "—")) },
      { label: "Steps trained", values: pair((record) => compactNumber(record.run.step)) },
      { label: "Revision", values: pair((record) => String(record.run.revision_number)) },
      ...common.map((checkpoint) => ({
        label: `At ${compactNumber(checkpoint.step)}`,
        values: [score(checkpoint), score(stepsB.get(checkpoint.step))] as const,
      })),
    ],
  };
}

export function runComparison(sides: readonly ComparedRecord[]): Comparison {
  const [a, b] = sides;
  if (!a || !b) {
    return { basis: "Pick two runs", sides: [] };
  }
  const bests = [bestCheckpoint(a), bestCheckpoint(b)];
  const top = Math.max(...bests.map((best) => best?.success_rate ?? -1));
  return {
    basis: basis([a, b]),
    sides: [a, b].map((side, index) => {
      const best = bests[index];
      const leads = best?.success_rate != null && best.success_rate === top && bests[1 - index]?.success_rate !== top;
      const tone: Tone = leads ? "ok" : "neutral";
      const chips = best
        ? [
            ...(best.success_rate == null ? [] : [{ text: `success ${percent(best.success_rate)}`, tone }]),
            { text: `return ${signed(best.episode_return)}`, tone: "neutral" as const },
          ]
        : [{ text: "no checkpoint yet", tone: "neutral" as const }];
      const title = best ? `${side.run.name} · checkpoint ${compactNumber(best.step)}` : side.run.name;
      return { id: side.run.run_id, title, chips };
    }),
    table: compareTable(a, b),
  };
}
