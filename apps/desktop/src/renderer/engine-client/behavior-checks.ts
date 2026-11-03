import type {
  BehaviorComparison,
  BehaviorEpisode,
  BehaviorMatchRow,
  BehaviorTest,
  BehaviorTestResult,
  CheckpointEpisode,
  EpisodeActivations,
  LayerActivity,
  NeuronActivity,
} from "@icarus/contracts";
import { has, isListOf, isRecord } from "./response-checks.ts";

// Structural checks of behavior tests, their results, checkpoint episodes and episode activations.

const isPoint = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every((part) => typeof part === "number");

export function isBehaviorTest(value: unknown): value is BehaviorTest {
  return (
    isRecord(value) &&
    has(value, "id", "string") &&
    has(value, "name", "string") &&
    isListOf(value.starts, (start): start is number => typeof start === "number") &&
    has(value, "pass_share", "number")
  );
}

export function isBehaviorTests(value: unknown): value is BehaviorTest[] {
  return isListOf(value, isBehaviorTest);
}

const isEpisode = (value: unknown): value is BehaviorEpisode =>
  isRecord(value) &&
  has(value, "seed", "number") &&
  has(value, "passed", "boolean") &&
  has(value, "ending", "string") &&
  has(value, "seconds", "number") &&
  isListOf(value.path, isPoint);

export function isBehaviorTestResult(value: unknown): value is BehaviorTestResult {
  return (
    isRecord(value) &&
    isBehaviorTest(value.test) &&
    has(value, "run_id", "string") &&
    has(value, "step", "number") &&
    has(value, "passed", "boolean") &&
    has(value, "passed_share", "number") &&
    has(value, "mean_seconds", "number") &&
    has(value, "mean_path_length", "number") &&
    isListOf(value.episodes, isEpisode)
  );
}

export function isBehaviorTestResults(value: unknown): value is BehaviorTestResult[] {
  return isListOf(value, isBehaviorTestResult);
}

const isMatchRow = (value: unknown): value is BehaviorMatchRow =>
  has(value, "label", "string") &&
  has(value, "unit", "string") &&
  has(value, "a", "number") &&
  has(value, "b", "number") &&
  has(value, "close", "boolean");

export function isBehaviorComparison(value: unknown): value is BehaviorComparison {
  return (
    isRecord(value) &&
    has(value, "test_id", "string") &&
    isBehaviorTestResult(value.a) &&
    isBehaviorTestResult(value.b) &&
    isListOf(value.rows, isMatchRow) &&
    has(value, "path_gap", "number") &&
    has(value, "similarity", "number")
  );
}

const isCheckpointEpisode = (value: unknown): value is CheckpointEpisode =>
  has(value, "index", "number") &&
  has(value, "passed", "boolean") &&
  has(value, "ending", "string") &&
  has(value, "seconds", "number");

export function isCheckpointEpisodes(value: unknown): value is CheckpointEpisode[] {
  return isListOf(value, isCheckpointEpisode);
}

const isNeuron = (value: unknown): value is NeuronActivity =>
  has(value, "index", "number") &&
  has(value, "mean", "number") &&
  has(value, "peak", "number") &&
  has(value, "active_share", "number");

const isLayer = (value: unknown): value is LayerActivity =>
  isRecord(value) && has(value, "name", "string") && has(value, "size", "number") && isListOf(value.neurons, isNeuron);

export function isEpisodeActivations(value: unknown): value is EpisodeActivations {
  return (
    isRecord(value) &&
    has(value, "run_id", "string") &&
    has(value, "step", "number") &&
    has(value, "frames", "number") &&
    has(value, "seconds", "number") &&
    has(value, "outcome", "string") &&
    has(value, "matches_recording", "boolean") &&
    isListOf(value.layers, isLayer)
  );
}
