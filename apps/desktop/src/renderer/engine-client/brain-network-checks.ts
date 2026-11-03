import type {
  BrainActivations,
  BrainBehavior,
  BrainBehaviors,
  BrainNetwork,
  BrainReadings,
  BrainSizeOption,
  BrainSizes,
  BrainSourceOption,
  BrainSources,
  NetworkInput,
  NetworkLayer,
  NetworkOutput,
  PlayReading,
} from "@icarus/contracts";
import { has, isListOf, isRecord } from "./response-checks.ts";

// Structural checks of the brain network answers: the checkpoint's layers and what its neurons compute.

const isNumber = (value: unknown): value is number => typeof value === "number";
const isNumbers = (value: unknown): value is number[] => isListOf(value, isNumber);
const isString = (value: unknown): value is string => typeof value === "string";

const isInput = (value: unknown): value is NetworkInput =>
  has(value, "index", "number") && has(value, "label", "string");
const isOutput = (value: unknown): value is NetworkOutput =>
  has(value, "index", "number") && has(value, "label", "string");
const isLayer = (value: unknown): value is NetworkLayer =>
  has(value, "name", "string") && has(value, "size", "number") && has(value, "activation", "string");

export function isBrainNetwork(value: unknown): value is BrainNetwork {
  return (
    isRecord(value) &&
    has(value, "run_id", "string") &&
    has(value, "step", "number") &&
    isListOf(value.inputs, isInput) &&
    isListOf(value.layers, isLayer) &&
    isListOf(value.outputs, isOutput)
  );
}

export function isBrainActivations(value: unknown): value is BrainActivations {
  return (
    isRecord(value) &&
    has(value, "run_id", "string") &&
    has(value, "step", "number") &&
    isListOf(value.observation_labels, isString) &&
    isNumbers(value.observation) &&
    isListOf(value.layers, isNumbers) &&
    isNumbers(value.outputs)
  );
}

const isReading = (value: unknown): value is PlayReading =>
  has(value, "id", "string") &&
  has(value, "label", "string") &&
  has(value, "value", "number") &&
  has(value, "min", "number") &&
  has(value, "max", "number");

export function isBrainReadings(value: unknown): value is BrainReadings {
  return (
    isRecord(value) &&
    has(value, "run_id", "string") &&
    has(value, "step", "number") &&
    has(value, "seconds", "number") &&
    isListOf(value.senses, isReading) &&
    isListOf(value.actions, isReading)
  );
}

const isBehavior = (value: unknown): value is BrainBehavior =>
  has(value, "id", "string") &&
  has(value, "name", "string") &&
  has(value, "detail", "string") &&
  has(value, "episodes", "number") &&
  has(value, "of", "number");

export function isBrainBehaviors(value: unknown): value is BrainBehaviors {
  return isRecord(value) && has(value, "run_id", "string") && isListOf(value.behaviors, isBehavior);
}

const isSize = (value: unknown): value is BrainSizeOption =>
  isRecord(value) &&
  has(value, "id", "string") &&
  has(value, "label", "string") &&
  isNumbers(value.layers) &&
  has(value, "recommended", "boolean") &&
  has(value, "current", "boolean") &&
  (value.trained === undefined || value.trained === null || has(value.trained, "minutes", "number"));

export function isBrainSizes(value: unknown): value is BrainSizes {
  return (
    isRecord(value) && has(value, "senses", "number") && has(value, "motors", "number") && isListOf(value.sizes, isSize)
  );
}

const isSource = (value: unknown): value is BrainSourceOption =>
  has(value, "run_id", "string") &&
  has(value, "step", "number") &&
  has(value, "project_name", "string") &&
  has(value, "run_name", "string") &&
  has(value, "fits", "boolean");

export function isBrainSources(value: unknown): value is BrainSources {
  return (
    isRecord(value) &&
    has(value, "senses", "number") &&
    has(value, "motors", "number") &&
    isListOf(value.options, isSource)
  );
}
