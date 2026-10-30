import type {
  Behavior,
  BrainActivity,
  BrainPort,
  BrainShape,
  BrainSizes,
  BrainSource,
  Learning,
  NetworkNode,
  NetworkView,
  NeuronState,
  SensesActions,
  Wiring,
} from "./brain-port.ts";
import type { LiveReadings } from "./progress-step.ts";

// Sample brains from the design (the parking car and the fruit fly), used only by the prototype, the gallery and tests.

const PARK_SENSES: SensesActions = {
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

const PARK_LEARNING: Learning = {
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

const PARK_READINGS: LiveReadings = {
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

const FLY_READINGS: LiveReadings = {
  title: "Firing right now",
  rows: [
    { label: "Looming detectors", value: "82%", ratio: 0.82, hot: true },
    { label: "Turn left · DNa02", value: "64%", ratio: 0.64, hot: true },
    { label: "Walking rhythm", value: "90%", ratio: 0.9, hot: false },
    { label: "Grooming", value: "6%", ratio: 0.06, hot: false },
  ],
  caption: "A shadow is coming from the right, so it turns away",
};

const PARK_SHAPE: BrainShape = {
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

const PARK_NETWORK: NetworkView = {
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

const PARK_SIZES: BrainSizes = {
  note: "Estimates come from similar projects on a computer like yours. The real number shows up after training.",
  sizes: [
    {
      id: "small",
      label: "Small",
      shape: "1 layer × 64",
      diagram: [11, 8, 4],
      time: "Trains in about 15 min",
      expected: "Expected: parks about 55%",
      recommended: false,
    },
    {
      id: "medium",
      label: "Medium",
      shape: "2 layers × 256",
      diagram: [11, 9, 9, 4],
      time: "Trains in about 42 min",
      expected: "Expected: parks about 75%",
      recommended: true,
    },
    {
      id: "large",
      label: "Large",
      shape: "3 layers × 512",
      diagram: [11, 10, 10, 10, 4],
      time: "Trains in about 2 h",
      expected: "Expected: parks about 80%",
      recommended: false,
    },
  ],
};

const SIZE_LAYERS: Readonly<Record<string, readonly number[]>> = {
  small: [64],
  medium: [256, 256],
  large: [512, 512, 512],
};

const FLY_SOURCE: BrainSource = {
  title: "Choose the fly’s brain",
  intro: "The body is a physics model of a fruit fly with 6 legs, wings and a head. Pick what drives it.",
  selected: "connectome",
  options: [
    {
      id: "learn",
      title: "Learn a new brain",
      detail: "Icarus trains a small network from scratch with practice (reinforcement learning)",
    },
    {
      id: "connectome",
      title: "Load a connectome",
      detail: "Use a real animal brain map as the wiring, neuron by neuron",
      dataset: {
        name: "FlyWire · adult fruit fly",
        facts: "139,255 neurons · ~50 million synapses · open data",
        fit: "Fits the fly body",
      },
    },
    { id: "community", title: "Start from a community brain", detail: "Remix a brain someone already trained" },
  ],
  connections: [
    { text: "Eye and antenna neurons get the body’s senses", tone: "ok" },
    { text: "Motor neurons drive the leg and wing joints · 92% matched", tone: "ok" },
    { text: "8% of motor neurons have no joint yet, they stay silent", tone: "warn" },
  ],
};

const FLY_ACTIVITY: BrainActivity = {
  live: true,
  regions: [
    {
      id: "visual",
      name: "Visual system",
      detail: "Turns light into motion and looming signals",
      neurons: 64,
      active: 18,
    },
    { id: "central", name: "Central complex", detail: "Keeps track of heading and steers", neurons: 58, active: 12 },
    { id: "mushroom", name: "Mushroom body", detail: "Learns smells and what they mean", neurons: 56, active: 6 },
    {
      id: "descending",
      name: "Descending neurons",
      detail: "Send commands from the brain to the body",
      neurons: 60,
      active: 14,
    },
    { id: "nerve-cord", name: "Ventral nerve cord", detail: "Runs the leg rhythms of walking", neurons: 64, active: 9 },
  ],
};

const FLY_BEHAVIORS: Behavior[] = [
  { id: "walk", name: "Walks with a tripod gait", when: "0:02", detail: "Three legs on the floor at a time" },
  { id: "turn", name: "Turns away from a looming shadow", when: "0:07", detail: "DNa02 fires, then it turns left" },
  { id: "groom", name: "Grooms its head", when: "0:15", detail: "Later than recorded flies do" },
];

const FLY_WIRING: Wiring = {
  unmatched: 8,
  maps: [
    { id: "senses", name: "Senses map", matched: "100%", detail: "Eye and antenna neurons get the body’s senses" },
    { id: "motor", name: "Motor map", matched: "92%", detail: "Motor neurons drive the leg and wing joints" },
  ],
};

type BrainDocument = {
  senses: SensesActions;
  learning: Learning;
  readings: LiveReadings;
  shape: BrainShape;
  network: NetworkView;
  sizes: BrainSizes;
  source: BrainSource;
  activity: BrainActivity;
  behaviors: Behavior[];
  wiring: Wiring;
};

const BRAINS: Readonly<Record<string, BrainDocument>> = {
  "park-pilot": {
    senses: PARK_SENSES,
    learning: PARK_LEARNING,
    readings: PARK_READINGS,
    shape: PARK_SHAPE,
    network: PARK_NETWORK,
    sizes: PARK_SIZES,
    source: { ...FLY_SOURCE, selected: "learn" },
    activity: { live: false, regions: [] },
    behaviors: [],
    wiring: { unmatched: 0, maps: [] },
  },
  "fruit-fly": {
    senses: { inputs: [], outputs: [] },
    learning: { ...PARK_LEARNING, reward: [], proposedChanges: 0, curriculum: [] },
    readings: FLY_READINGS,
    shape: { ...PARK_SHAPE, layers: [] },
    network: { ...PARK_NETWORK, columns: [], links: [], focus: undefined },
    sizes: { ...PARK_SIZES, sizes: [] },
    source: FLY_SOURCE,
    activity: FLY_ACTIVITY,
    behaviors: FLY_BEHAVIORS,
    wiring: FLY_WIRING,
  },
};

const toggle = <T extends { id: string; enabled: boolean }>(items: readonly T[], id: string): T[] =>
  items.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item));

// In-memory brains that behave: switches switch, sliders resize, choosing a size reshapes the brain.
export function createBrainFixture(): BrainPort {
  const brains = new Map<string, BrainDocument>(Object.entries(BRAINS));
  const find = (brain: string) => {
    const document = brains.get(brain);
    if (!document) {
      throw new Error(`No brain ${brain}`);
    }
    return document;
  };
  const edit = <K extends keyof BrainDocument>(brain: string, key: K, next: BrainDocument[K]) => {
    brains.set(brain, { ...find(brain), [key]: next });
    return next;
  };
  const reshape = (brain: string, change: (shape: BrainShape) => BrainShape) =>
    edit(brain, "shape", change(find(brain).shape));
  return {
    getSensesActions: async (brain) => find(brain).senses,
    toggleInput: async ({ brain, id }) => {
      const senses = find(brain).senses;
      return edit(brain, "senses", { ...senses, inputs: toggle(senses.inputs, id) });
    },
    toggleOutput: async ({ brain, id }) => {
      const senses = find(brain).senses;
      return edit(brain, "senses", { ...senses, outputs: toggle(senses.outputs, id) });
    },
    getLearning: async (brain) => find(brain).learning,
    setRewardWeight: async ({ brain, id, weight }) => {
      const learning = find(brain).learning;
      const reward = learning.reward.map((term) => (term.id === id ? { ...term, weight, proposed: false } : term));
      return edit(brain, "learning", { ...learning, reward });
    },
    getReadings: async (brain) => find(brain).readings,
    getShape: async (brain) => find(brain).shape,
    setLayerSize: async ({ brain, id, neurons }) =>
      reshape(brain, (shape) => ({
        ...shape,
        layers: shape.layers.map((layer) => (layer.id === id ? { ...layer, neurons } : layer)),
      })),
    setDecisionsPerSecond: async ({ brain, value }) =>
      reshape(brain, (shape) => ({ ...shape, decisionsPerSecond: { ...shape.decisionsPerSecond, value } })),
    toggleRule: async ({ brain, id }) => reshape(brain, (shape) => ({ ...shape, rules: toggle(shape.rules, id) })),
    addLayer: async (brain) =>
      reshape(brain, (shape) => ({
        ...shape,
        layers: [...shape.layers, { id: `layer-${shape.layers.length + 1}`, neurons: 128, max: 512 }],
      })),
    getNetwork: async ({ brain, checkpoint }) => {
      const network = find(brain).network;
      return checkpoint ? { ...network, checkpoint } : network;
    },
    getSizes: async (brain) => find(brain).sizes,
    chooseSize: async ({ brain, id }) =>
      reshape(brain, (shape) => ({
        ...shape,
        layers: (SIZE_LAYERS[id] ?? []).map((neurons, index) => ({ id: `layer-${index + 1}`, neurons, max: 512 })),
      })),
    getSource: async (brain) => find(brain).source,
    loadSource: async ({ brain, id }) => {
      edit(brain, "source", { ...find(brain).source, selected: id });
    },
    getActivity: async (brain) => find(brain).activity,
    getBehaviors: async (brain) => find(brain).behaviors,
    getWiring: async (brain) => find(brain).wiring,
  };
}
