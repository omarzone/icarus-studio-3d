import type { EditOperation, BrainSizes as EngineSizes, Project } from "@icarus/contracts";
import type { BrainShape, BrainSize, BrainSizes } from "./brain-port.ts";
import { estimateText } from "./ideas-views.ts";

// Pure mappings between the brain spec and task rules and the brain workspace's shape and sizes views.

// Mirror the engine's contract limits (contracts/specs.py).
export const MIN_NEURONS = 8;
export const MAX_NEURONS = 1024;
export const MAX_LAYERS = 4;
export const MIN_DECISIONS = 5;
export const MAX_DECISIONS = 50;
const DEFAULT_DECISIONS = 20;
const DEFAULT_SECONDS = 30;

const TIME_LOCKED = "Every try ends in time so practice keeps moving; ask the copilot to change how long it lasts";

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, Math.round(value)));
}

function layerIndex(id: string): number {
  const index = Number(id.replace("layer-", "")) - 1;
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`There is no ${id}`);
  }
  return index;
}

// Layers as sliders, the decision rate and the rules that end a try, from the project the engine holds.
export function shapeView(project: Project): BrainShape {
  const brain = project.brain;
  const task = project.task;
  const decisions = brain.decisions_per_second ?? DEFAULT_DECISIONS;
  const seconds = task.episode_seconds ?? DEFAULT_SECONDS;
  const rules: BrainShape["rules"][number][] = [
    { id: "time-limit", label: `End after ${seconds} seconds`, enabled: true, lockedReason: TIME_LOCKED },
    { id: "fall", label: "End when it falls", enabled: task.end_on_fall ?? true },
  ];
  if (task.family === "navigation") {
    rules.push({ id: "success", label: "End when it reaches the goal", enabled: task.end_on_success ?? true });
  }
  return {
    layers: (brain.layers ?? [256, 256]).map((neurons, index) => ({
      id: `layer-${index + 1}`,
      neurons,
      max: MAX_NEURONS,
    })),
    decisionsPerSecond: { value: decisions, max: MAX_DECISIONS },
    hint: `Each decision is one step of practice: a ${seconds}-second try is ${Math.round(seconds * decisions)} steps. Bigger brains can learn harder moves but need more practice; Brain sizes shows what your runs measured.`,
    rules,
  };
}

export function layerOperation(project: Project, id: string, neurons: number): EditOperation {
  const layers = [...(project.brain.layers ?? [256, 256])];
  const index = layerIndex(id);
  if (index >= layers.length) {
    throw new Error(`The brain has no ${id}`);
  }
  layers[index] = clamp(neurons, MIN_NEURONS, MAX_NEURONS);
  return { op: "set_brain", layers };
}

export function addLayerOperation(project: Project): EditOperation {
  const layers = project.brain.layers ?? [256, 256];
  if (layers.length >= MAX_LAYERS) {
    throw new Error(`The brain has ${MAX_LAYERS} layers, the most it can have`);
  }
  return { op: "set_brain", layers: [...layers, layers.at(-1) ?? 256] };
}

export function decisionsOperation(value: number): EditOperation {
  return { op: "set_brain", decisions_per_second: clamp(value, MIN_DECISIONS, MAX_DECISIONS) };
}

export function ruleOperation(project: Project, id: string): EditOperation {
  switch (id) {
    case "fall":
      return { op: "set_episode", end_on_fall: !(project.task.end_on_fall ?? true) };
    case "success":
      return { op: "set_episode", end_on_success: !(project.task.end_on_success ?? true) };
    default:
      throw new Error(TIME_LOCKED);
  }
}

// Dots per layer in the size cards: a handful that grows with the neurons.
function dots(neurons: number): number {
  return clamp(Math.log2(Math.max(neurons, 1)) - 2, 2, 8);
}

function shapeText(layers: readonly number[]): string {
  const same = layers.every((size) => size === layers[0]);
  const count = `${layers.length} ${layers.length === 1 ? "layer" : "layers"}`;
  return same ? `${count} × ${layers[0] ?? 0}` : `${count}: ${layers.join(", ")}`;
}

function sizeView(option: EngineSizes["sizes"][number], senses: number, motors: number): BrainSize {
  const trained = option.trained ?? null;
  const success = trained?.success_rate;
  let expected = "No run has trained this size yet";
  if (trained) {
    expected =
      success === null || success === undefined
        ? `${trained.run_name} trained it`
        : `${trained.run_name} reached ${Math.round(success * 100)}% success`;
  }
  return {
    id: option.id,
    label: option.label,
    shape: shapeText(option.layers),
    diagram: [clamp(senses, 1, 11), ...option.layers.map(dots), clamp(motors, 1, 6)],
    time: trained ? `Trained in ${estimateText(trained.minutes)} on this computer` : "Not timed on this computer yet",
    expected,
    recommended: option.recommended,
  };
}

export function sizesView(sizes: EngineSizes): BrainSizes {
  return {
    note: "Times and results come from runs of this project on this computer; a size no run has trained shows none.",
    sizes: sizes.sizes.map((option) => sizeView(option, sizes.senses, sizes.motors)),
  };
}

export function sizeOperation(sizes: EngineSizes, id: string): EditOperation {
  const option = sizes.sizes.find((item) => item.id === id);
  if (!option) {
    throw new Error(`There is no ${id} brain size`);
  }
  return { op: "set_brain", layers: [...option.layers] };
}
