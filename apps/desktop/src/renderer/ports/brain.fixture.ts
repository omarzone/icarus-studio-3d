import type {
  Behavior,
  BrainActivity,
  BrainPort,
  BrainShape,
  BrainSizes,
  BrainSource,
  Learning,
  NetworkView,
  SensesActions,
  Wiring,
} from "./brain-port.ts";
import { FLY_ACTIVITY, FLY_BEHAVIORS, FLY_READINGS, FLY_SOURCE, FLY_WIRING } from "./fly-brain.fixture.ts";
import {
  PARK_LEARNING,
  PARK_NETWORK,
  PARK_READINGS,
  PARK_SENSES,
  PARK_SHAPE,
  PARK_SIZES,
} from "./park-brain.fixture.ts";
import type { LiveReadings } from "./progress-step.ts";

// Sample brains from the design (the parking car and the fruit fly), used only by the prototype, the gallery and tests.

const SIZE_LAYERS: Readonly<Record<string, readonly number[]>> = {
  small: [64],
  medium: [256, 256],
  large: [512, 512, 512],
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
    addInput: async (brain) => {
      const senses = find(brain).senses;
      const id = `ray-${senses.inputs.length + 1}`;
      const added = { id, name: `Ray ${senses.inputs.length + 1}`, detail: "1 ray · 5 m · ahead", enabled: true };
      return edit(brain, "senses", { ...senses, inputs: [...senses.inputs, added] });
    },
    removeInput: async ({ brain, id }) => {
      const senses = find(brain).senses;
      return edit(brain, "senses", { ...senses, inputs: senses.inputs.filter((input) => input.id !== id) });
    },
    renameInput: async ({ brain, id, name }) => {
      const senses = find(brain).senses;
      const inputs = senses.inputs.map((input) => (input.id === id ? { ...input, name: name.trim() } : input));
      return edit(brain, "senses", { ...senses, inputs });
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
    getRewardOptions: async () => [],
    addRewardTerm: async ({ brain }) => find(brain).learning,
    removeRewardTerm: async ({ brain, id }) => {
      const learning = find(brain).learning;
      return edit(brain, "learning", { ...learning, reward: learning.reward.filter((term) => term.id !== id) });
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
    // Sample brains never play, so nothing live ever changes.
    watchLive: () => () => undefined,
  };
}
