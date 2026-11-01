import type {
  BrainShape,
  BrainSizes,
  Learning,
  NetworkNode,
  NetworkView,
  NeuronState,
  SensesActions,
} from "./brain-port.ts";
import type { LiveReadings } from "./progress-step.ts";

// The parking car's brain from the design, used only by the prototype, the gallery and tests.

export const PARK_SENSES: SensesActions = {
  inputs: [
    { id: "front", name: "Front sensors · 6", detail: "distance to cars and walls", enabled: true },
    { id: "rear", name: "Rear sensors · 2", detail: "distance behind", enabled: true },
    { id: "speed", name: "Speed", detail: "how fast it moves", enabled: true },
    { id: "steering", name: "Steering angle", detail: "where the wheels point", enabled: true },
    { id: "goal", name: "Free spot direction", detail: "where the goal is", enabled: true },
    { id: "side", name: "Side sensors · 2", detail: "proposed by the coach", enabled: false, proposed: true },
  ],
  outputs: [
    { id: "steer", name: "Steer", detail: "−30° … 30°", enabled: true },
    { id: "throttle", name: "Throttle", detail: "0 … 1", enabled: true },
    { id: "brake", name: "Brake", detail: "0 … 1", enabled: true },
  ],
};

export const PARK_LEARNING: Learning = {
  proposedChanges: 1,
  reward: [
    {
      id: "park",
      name: "Park in the spot",
      detail: "Big reward when it stops inside the lines",
      weight: 2.5,
      scale: 3.2,
      kind: "goal",
    },
    {
      id: "closer",
      name: "Get closer",
      detail: "Small reward for moving toward the spot",
      weight: 1,
      scale: 2.5,
      kind: "reward",
    },
    {
      id: "touch",
      name: "Touching cars",
      detail: "Penalty when it scrapes or hits",
      weight: -1,
      scale: 2,
      kind: "penalty",
      proposed: true,
    },
    { id: "time", name: "Time", detail: "Small penalty for every second", weight: -0.01, scale: 0.125, kind: "cost" },
  ],
  goal: {
    success: "Stops inside the free spot, between the lines",
    timeLimit: "30 s",
    endsWhen: ["It parks", "It hits a car", "Time runs out"],
  },
  curriculum: [
    { id: "empty", name: "Empty lot", detail: "No parked cars, wide spot", active: false },
    { id: "some", name: "A few cars", detail: "Two parked cars, normal spot", active: true },
    { id: "full", name: "Full lot", detail: "Five parked cars, tight spot", active: false },
  ],
};

export const PARK_READINGS: LiveReadings = {
  title: "What the brain sees now",
  rows: [
    { label: "Front L", value: "0.6 m", ratio: 0.18, hot: true },
    { label: "Front", value: "2.1 m", ratio: 0.64, hot: false },
    { label: "Front R", value: "2.6 m", ratio: 0.8, hot: false },
    { label: "Rear", value: "3.0 m", ratio: 0.92, hot: false },
    { label: "Speed", value: "1.1 m/s", ratio: 0.35, hot: false },
    { label: "Steering", value: "12°", ratio: 0.58, hot: false },
  ],
  caption: "Then it picks: steer 8° left, speed 0.4",
};

export const PARK_SHAPE: BrainShape = {
  layers: [
    { id: "layer-1", neurons: 256, max: 512 },
    { id: "layer-2", neurons: 256, max: 512 },
  ],
  decisionsPerSecond: { value: 25, max: 40 },
  hint: "Bigger brains can learn harder moves, but need more practice. On your CPU, 2 × 512 trains about 2.3× slower.",
  rules: [
    { id: "reset-on-hit", label: "Reset when it hits a car", enabled: true },
    { id: "time-limit", label: "End after 30 seconds", enabled: true },
  ],
};

// One letter per neuron: h hot, o on, i idle.
const STATE_OF: Readonly<Record<string, NeuronState>> = { h: "hot", o: "on", i: "idle" };
const states = (text: string): NetworkNode[] =>
  [...text].map((mark): NetworkNode => ({ state: STATE_OF[mark] ?? "idle" }));
const labelled = (labels: readonly string[], marks: string): NetworkNode[] =>
  states(marks).map((node, index) => ({ ...node, label: labels[index] }));

export const PARK_NETWORK: NetworkView = {
  checkpoints: ["Live", "25k", "312k"],
  checkpoint: "Live",
  columns: [
    {
      label: "Inputs · 11",
      nodes: labelled(
        [
          "Front L",
          "Front",
          "Front R",
          "Side L",
          "Side R",
          "Rear L",
          "Rear R",
          "Speed",
          "Steering",
          "Goal dir",
          "Goal dist",
        ],
        "hohiooioioi",
      ),
    },
    { label: "Layer 1 · 256", nodes: states("iohiihhoohihiiii") },
    { label: "Layer 2 · 256", nodes: states("hiohooiiihoiooih") },
    { label: "Outputs · 3", nodes: labelled(["Steer", "Throttle", "Brake"], "hio") },
  ],
  links: [
    { column: 0, from: 0, to: 5 },
    { column: 0, from: 2, to: 2 },
    { column: 0, from: 2, to: 6 },
    { column: 0, from: 7, to: 6 },
    { column: 1, from: 2, to: 2 },
    { column: 1, from: 2, to: 12 },
    { column: 1, from: 6, to: 12 },
    { column: 1, from: 9, to: 0 },
    { column: 1, from: 9, to: 9 },
    { column: 1, from: 11, to: 0 },
    { column: 1, from: 11, to: 2 },
    { column: 1, from: 11, to: 5 },
    { column: 2, from: 0, to: 0 },
    { column: 2, from: 9, to: 0 },
    { column: 2, from: 15, to: 0 },
  ],
  focus: { column: 2, node: 6, title: "Neuron 2·41", detail: "Fires when a car is close on the left" },
  name: "Park Pilot",
  summary: "2 layers × 256 neurons · 70k parameters · 25 decisions per second",
};

export const PARK_SIZES: BrainSizes = {
  note: "Estimates come from similar projects on a computer like yours. The real number shows up after training.",
  sizes: [
    {
      id: "small",
      label: "Small",
      shape: "1 layer × 64",
      diagram: [11, 5, 3],
      time: "Trains in about 15 min",
      expected: "Expected: parks about 55%",
      recommended: false,
    },
    {
      id: "medium",
      label: "Medium",
      shape: "2 layers × 256",
      diagram: [11, 8, 8, 3],
      time: "Trains in about 42 min",
      expected: "Expected: parks about 75%",
      recommended: true,
    },
    {
      id: "large",
      label: "Large",
      shape: "3 layers × 512",
      diagram: [11, 8, 8, 8, 3],
      time: "Trains in about 2 h",
      expected: "Expected: parks about 80%",
      recommended: false,
    },
  ],
};
