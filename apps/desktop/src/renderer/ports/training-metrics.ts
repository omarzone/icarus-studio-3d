import type { MetricPoint, RunStatus } from "@icarus/contracts";
import { compactNumber } from "../ui/compact-number.ts";
import type { LiveMetrics, MetricSeries, RewardTerm, Tone } from "./training-port.ts";
import { isFinal, signed } from "./training-views.ts";

// Pure mapping from a run's metric points onto the curves, changes and reward breakdown of the Metrics panel.

const MAX_SAMPLES = 48;
// Under this relative change (or this many percentage points) a series reads as steady.
const STEADY = 0.01;

type Better = "up" | "down" | "either";

type SeriesSpec = {
  label: string;
  read: (point: MetricPoint) => number | null | undefined;
  rate: boolean;
  better: Better;
  meaning: MetricSeries["meaning"];
};

const SERIES: readonly SeriesSpec[] = [
  { label: "Mean return", read: (point) => point.episode_return, rate: false, better: "up", meaning: "primary" },
  { label: "Success", read: (point) => point.success_rate, rate: true, better: "up", meaning: "primary" },
  { label: "Failures", read: (point) => point.failure_rate, rate: true, better: "down", meaning: "danger" },
  { label: "Episode length", read: (point) => point.episode_length, rate: false, better: "either", meaning: "primary" },
];

const round = (value: number, digits = 3) => Number(value.toFixed(digits));

function downsample(values: readonly number[]): number[] {
  if (values.length <= MAX_SAMPLES) {
    return [...values];
  }
  return Array.from({ length: MAX_SAMPLES }, (_, index) => {
    const at = Math.round((index * (values.length - 1)) / (MAX_SAMPLES - 1));
    return values[at] ?? 0;
  });
}

function toneOf(delta: number, better: Better): Tone {
  if (better === "either") {
    return "neutral";
  }
  return delta > 0 === (better === "up") ? "ok" : "warn";
}

// Change of the latest value against the one a quarter of the curve earlier.
function changeOf(values: readonly number[], spec: SeriesSpec): MetricSeries["change"] {
  const last = values.at(-1) ?? 0;
  const base = values.at(-1 - Math.max(1, Math.floor(values.length / 4))) ?? last;
  const delta = last - base;
  if (spec.rate) {
    const points = Math.round(delta);
    return Math.abs(delta) < STEADY * 100
      ? { text: "steady", tone: "neutral" }
      : { text: `${points > 0 ? "+" : "−"}${Math.abs(points)} pts`, tone: toneOf(delta, spec.better) };
  }
  const relative = Math.abs(base) > 1e-9 ? delta / Math.abs(base) : delta;
  if (Math.abs(relative) < STEADY) {
    return { text: "steady", tone: "neutral" };
  }
  const size = Math.abs(base) > 1e-9 ? `${Math.round(Math.abs(relative) * 100)}%` : Math.abs(delta).toFixed(1);
  return { text: `${delta > 0 ? "+" : "−"}${size}`, tone: toneOf(delta, spec.better) };
}

function series(points: readonly MetricPoint[], spec: SeriesSpec): MetricSeries | null {
  const values: number[] = [];
  for (const point of points) {
    const value = spec.read(point);
    if (typeof value === "number") {
      values.push(spec.rate ? round(value * 100, 1) : value);
    }
  }
  const last = values.at(-1);
  if (last === undefined) {
    return null;
  }
  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  return {
    label: spec.label,
    value: spec.rate
      ? `${Math.round(last)}%`
      : spec.label === "Episode length"
        ? String(Math.round(last))
        : signed(last),
    change: changeOf(values, spec),
    meaning: spec.meaning,
    samples: downsample(values),
    min: spec.rate ? 0 : round(Math.min(0, lowest * 1.1)),
    max: spec.rate ? 100 : round(highest > 0 ? highest * 1.1 : 1),
  };
}

function breakdown(points: readonly MetricPoint[], labels: ReadonlyMap<string, string>): RewardTerm[] {
  const latest = points.findLast((point) => Object.keys(point.reward_terms).length > 0);
  if (!latest) {
    return [];
  }
  const terms = Object.entries(latest.reward_terms).sort(([, a], [, b]) => Math.abs(b) - Math.abs(a));
  const largest = Math.max(...terms.map(([, value]) => Math.abs(value)), 1e-9);
  const topGain = terms.find(([, value]) => value >= 0)?.[0];
  const topPenalty = terms.find(([, value]) => value < 0)?.[0];
  return terms.map(([term, value]) => ({
    label: labels.get(term) ?? term,
    value: signed(value, 2),
    ratio: round(Math.abs(value) / largest, 2),
    tone: value >= 0 ? (term === topGain ? "main" : "minor") : term === topPenalty ? "danger" : "warn",
  }));
}

export function liveMetrics(
  run: RunStatus,
  points: readonly MetricPoint[],
  labels: ReadonlyMap<string, string>,
): LiveMetrics {
  const trained = points.filter((point) => point.kind === "train");
  const curve = trained.length > 0 ? trained : points;
  const speed = isFinal(run) ? run.state : `${Math.round(run.steps_per_second).toLocaleString("en-US")} steps/s`;
  return {
    progress: `${compactNumber(run.step)} / ${compactNumber(run.total_steps)} · ${speed}`,
    series: SERIES.map((spec) => series(curve, spec)).filter((item) => item !== null),
    breakdown: { title: `Reward breakdown · v${run.revision_number}`, terms: breakdown(curve, labels) },
  };
}
