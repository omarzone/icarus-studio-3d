import type {
  BehaviorComparison,
  BehaviorTest,
  BehaviorTestResult,
  CheckpointEpisode,
  EpisodeActivations,
} from "@icarus/contracts";
import { compactNumber } from "../ui/compact-number.ts";
import type {
  BehaviorMatchTable,
  NeuronLayer,
  Path,
  Recording,
  ReferenceComparison,
  ReferenceTestState,
  ReferenceTests,
  ResultSummary,
  TestRun,
  Timelapse,
} from "./results-port.ts";
import { bestCheckpoint, type RunRecord } from "./results-views.ts";
import { checkpointResult, percent } from "./training-views.ts";

// Pure mappings from runs, behavior test results and episode activations onto the Results view types.

// A checkpoint that behavior tests judge.
export type Judged = { run: string; step: number; label: string };

const TOP_NEURONS = 12;
const VIEW_MARGIN = 6;

const byStart = (a: RunRecord, b: RunRecord) => Date.parse(a.run.started_at) - Date.parse(b.run.started_at);

function judgedOf(record: RunRecord, step: number): Judged {
  return { run: record.run.run_id, step, label: `${record.run.name} · ${compactNumber(step)}` };
}

// The compared runs' best checkpoints, oldest first; with one run, its untrained brain against its best.
export function judgedCheckpoints(records: readonly RunRecord[], compared: readonly string[]): Judged[] {
  const chosen = records.filter((record) => compared.includes(record.run.run_id)).sort(byStart);
  const sides = chosen.flatMap((record) => {
    const best = bestCheckpoint(record);
    return best ? [judgedOf(record, best.step)] : [];
  });
  if (sides.length >= 2) {
    return sides.slice(-2);
  }
  const newest = records[0];
  const best = newest ? bestCheckpoint(newest) : undefined;
  if (!newest || !best) {
    return [];
  }
  const untrained = newest.checkpoints.some((checkpoint) => checkpoint.step === 0) && best.step !== 0;
  return untrained ? [judgedOf(newest, 0), judgedOf(newest, best.step)] : [judgedOf(newest, best.step)];
}

const sameTest = (a: BehaviorTest, b: BehaviorTest) => JSON.stringify(a) === JSON.stringify(b);

// The stored result of a test at a checkpoint, only while the test is still defined the same way.
export function resultOf(
  results: readonly BehaviorTestResult[],
  test: BehaviorTest,
  side: Judged,
): BehaviorTestResult | undefined {
  return results.find(
    (result) => result.run_id === side.run && result.step === side.step && sameTest(result.test, test),
  );
}

function stateOf(result: BehaviorTestResult | undefined): ReferenceTestState {
  if (!result) {
    return "not-run";
  }
  return result.passed ? "pass" : "warn";
}

export function referenceTestsView(
  tests: readonly BehaviorTest[],
  results: readonly BehaviorTestResult[],
  sides: readonly Judged[],
  selected: string | undefined,
): ReferenceTests {
  const newest = sides.at(-1);
  const chosen = tests.some((test) => test.id === selected) ? selected : tests[0]?.id;
  return {
    selected: chosen ?? "",
    tests: tests.map((test) => ({
      id: test.id,
      name: test.name,
      short: test.name,
      state: newest ? stateOf(resultOf(results, test, newest)) : "not-run",
    })),
    judged: newest ? `On ${sides.map((side) => side.label).join(" and ")}` : undefined,
  };
}

function passedText(result: BehaviorTestResult): string {
  const passed = result.episodes.filter((episode) => episode.passed).length;
  return `${passed} of ${result.episodes.length} passed`;
}

export function referenceSummary(tests: ReferenceTests): ResultSummary {
  const ran = tests.tests.filter((test) => test.state !== "not-run");
  if (ran.length === 0) {
    return { kind: "empty", title: "Behavior tests", detail: "No behavior test has run on this checkpoint yet." };
  }
  const passed = ran.filter((test) => test.state === "pass").length;
  const next = tests.tests.find((test) => test.state === "not-run");
  const judged = tests.judged ? ` ${tests.judged}.` : "";
  const after = next ? ` Not run yet: ${next.name}.` : "";
  return {
    kind: "match",
    title: "Behavior tests",
    value: `${passed} of ${ran.length}`,
    detail: `${passed} of ${ran.length} tests that ran passed.${judged}${after}`,
  };
}

// Every path of both sides on one scale, so the same metre looks the same on each side.
export function scaledPaths(sides: readonly (readonly (readonly [number, number])[])[][]): Path[][] {
  const points = sides.flat(2);
  if (points.length === 0) {
    return sides.map((paths) => paths.map(() => []));
  }
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(maxX - minX, maxY - minY, 1e-6);
  const scale = (100 - 2 * VIEW_MARGIN) / span;
  const offsetX = (100 - (maxX - minX) * scale) / 2;
  const offsetY = (100 - (maxY - minY) * scale) / 2;
  // Ground y points left, the picture's y points down.
  const at = ([x, y]: readonly [number, number]): readonly [number, number] => [
    Math.round((offsetX + (x - minX) * scale) * 100) / 100,
    Math.round((100 - offsetY - (y - minY) * scale) * 100) / 100,
  ];
  return sides.map((paths) => paths.map((path) => path.map(at)));
}

export function referenceComparisonView(
  test: BehaviorTest,
  sides: readonly { side: Judged; result: BehaviorTestResult | undefined }[],
): ReferenceComparison {
  const paths = scaledPaths(sides.map(({ result }) => result?.episodes.map((episode) => episode.path) ?? []));
  const moved = test.shifts && test.shifts.length > 0 ? " · objects moved" : "";
  return {
    basis: `Same ${test.starts.length} starts${moved}`,
    sides: sides.map(({ side, result }, index) => ({
      id: `${side.run}:${side.step}`,
      title: side.label,
      detail: result ? passedText(result) : "Not run",
      paths: paths[index] ?? [],
    })),
  };
}

function shown(value: number, unit: string): string {
  return unit === "%" ? `${Math.round(value)}%` : `${value.toFixed(1)} ${unit}`;
}

export function behaviorMatchView(sides: readonly Judged[], comparison: BehaviorComparison | null): BehaviorMatchTable {
  const columns: [string, string] = [sides[0]?.label ?? "First", sides[1]?.label ?? "Second"];
  if (!comparison) {
    return { columns, rows: [] };
  }
  return {
    columns,
    rows: comparison.rows.map((row) => ({
      behavior: row.label,
      a: shown(row.a, row.unit),
      b: shown(row.b, row.unit),
      verdict: row.close ? "close" : "off",
    })),
    note: `Paths ${percent(comparison.similarity)} alike · ${comparison.path_gap.toFixed(2)} m apart on average`,
  };
}

export function neuronLayers(activations: EpisodeActivations): NeuronLayer[] {
  const replay = activations.matches_recording ? "the recorded episode" : "a replay that differs from the recording";
  return activations.layers.map((layer) => {
    const active = layer.neurons.filter((neuron) => neuron.active_share >= 0.5).length;
    const top = [...layer.neurons].sort((a, b) => b.mean - a.mean).slice(0, TOP_NEURONS);
    return {
      layer: `${layer.name} · ${layer.size} ${layer.activation}`,
      detail: `${active} of ${layer.size} active most of ${replay} (${activations.seconds.toFixed(1)} s)`,
      neurons: top.map((neuron) => ({
        id: `n${neuron.index + 1}`,
        label: `Neuron ${neuron.index + 1} · mean ${neuron.mean.toFixed(2)} · active ${percent(neuron.active_share)}`,
        activity: Math.min(1, neuron.mean),
      })),
    };
  });
}

export function testRunsView(run: string, step: number, episodes: readonly CheckpointEpisode[]): TestRun[] {
  return episodes.map((episode) => ({
    id: `${run}:${step}:${episode.index}`,
    label: `Episode ${episode.index + 1} · ${episode.ending} · ${episode.seconds.toFixed(1)} s`,
    passed: episode.passed,
  }));
}

export const frameId = (run: string, step: number) => `${run}:${step}`;

export function recordingsView(records: readonly RunRecord[]): Recording[] {
  return records.flatMap((record) =>
    record.checkpoints
      .filter((checkpoint) => checkpoint.has_rollout)
      .reverse()
      .map((checkpoint) => ({
        id: frameId(record.run.run_id, checkpoint.step),
        name: `${record.run.name} · checkpoint ${compactNumber(checkpoint.step)}`,
        detail: checkpointResult(checkpoint),
        run: record.run.run_id,
        step: checkpoint.step,
      })),
  );
}

// The run to play: the one of the chosen frame, else the newest run with a recorded episode.
export function timelapseView(records: readonly RunRecord[], chosen: string | undefined): Timelapse {
  const playable = records.filter((record) => record.checkpoints.some((checkpoint) => checkpoint.has_rollout));
  const record = playable.find((item) => chosen?.startsWith(`${item.run.run_id}:`)) ?? playable[0] ?? records[0];
  if (!record) {
    return { eyebrow: "How it learned", title: "No training run yet", run: null, frames: [], current: "" };
  }
  const frames = record.checkpoints
    .filter((checkpoint) => checkpoint.has_rollout)
    .map((checkpoint) => ({
      id: frameId(record.run.run_id, checkpoint.step),
      label: `${checkpoint.step === 0 ? "Start" : compactNumber(checkpoint.step)} · ${checkpointResult(checkpoint)}`,
      step: checkpoint.step,
    }));
  const best = bestCheckpoint(record);
  const current =
    frames.find((frame) => frame.id === chosen)?.id ??
    frames.find((frame) => frame.step === best?.step)?.id ??
    frames.at(-1)?.id ??
    "";
  const shownFrame = frames.find((frame) => frame.id === current);
  return {
    eyebrow: `${record.run.name} · how it learned`,
    title: shownFrame ? `Checkpoint ${shownFrame.label}` : "No recorded episode yet",
    run: frames.length > 0 ? record.run.run_id : null,
    frames,
    current,
  };
}
