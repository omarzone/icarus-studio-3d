import type { BrainActivations, BrainNetwork, NetworkInput, NetworkLayer, NetworkOutput } from "@icarus/contracts";
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
