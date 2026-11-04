import { definePort } from "../app/runtime/port.tsx";
import { brainNetworkApi } from "../engine-client/brain-network-api.ts";
import { engineApi } from "../engine-client/engine-api.ts";
import { createBrainFixture } from "./brain.fixture.ts";
import { createEngineBrainActivity } from "./brain-activity-engine.ts";
import { createEngineBrainPort } from "./brain-engine.ts";
import { createEngineNetwork } from "./brain-network-engine.ts";
import { createEngineBrainShape } from "./brain-shape-engine.ts";
import type { CheckFact, LiveReadings } from "./progress-step.ts";

// View types of the brain workspace: what the brain senses and does, how it is rewarded, its shape and activity.

export type SenseInput = {
  id: string;
  name: string;
  detail: string;
  enabled: boolean;
  proposed?: boolean;
  // The sensor carries its own name, which the brain, Play and the view show.
  renamable?: boolean;
  removable?: boolean;
  // Why its switch cannot change, when it cannot.
  lockedReason?: string;
};
export type ActionOutput = { id: string; name: string; detail: string; enabled: boolean; lockedReason?: string };
export type SensesActions = { inputs: readonly SenseInput[]; outputs: readonly ActionOutput[] };

// Goal terms are the main reward, rewards help, penalties punish mistakes, costs nudge (time, energy).
export type RewardKind = "goal" | "reward" | "penalty" | "cost";
export type RewardTerm = {
  id: string;
  name: string;
  detail: string;
  weight: number;
  // Largest absolute weight the slider reaches.
  scale: number;
  kind: RewardKind;
  proposed?: boolean;
};
// A reward term the task could add: it fits the task family and is not in the reward yet.
export type RewardOption = { term: string; name: string; detail: string; weight: number };
export type CurriculumStage = { id: string; name: string; detail: string; active: boolean };
export type Learning = {
  reward: readonly RewardTerm[];
  proposedChanges: number;
  goal: { success: string; timeLimit: string; endsWhen: readonly string[] };
  curriculum: readonly CurriculumStage[];
};

export type BrainLayer = { id: string; neurons: number; max: number };
export type BrainShape = {
  layers: readonly BrainLayer[];
  decisionsPerSecond: { value: number; max: number };
  hint: string;
  // A rule that cannot be switched says why.
  rules: readonly { id: string; label: string; enabled: boolean; lockedReason?: string }[];
};

export type NeuronState = "hot" | "on" | "idle";
export type NetworkNode = { label?: string; state: NeuronState };
export type NetworkColumn = { label: string; nodes: readonly NetworkNode[] };
// A connection that carries signal right now, from a node in one column to a node in the next.
export type HotLink = { column: number; from: number; to: number };
export type NetworkView = {
  checkpoints: readonly string[];
  checkpoint: string;
  columns: readonly NetworkColumn[];
  links: readonly HotLink[];
  focus?: { column: number; node: number; title: string; detail: string };
  name: string;
  summary: string;
};

export type BrainSize = {
  id: string;
  label: string;
  shape: string;
  // Neurons per layer for the mini diagram, inputs and outputs included.
  diagram: readonly number[];
  time: string;
  expected: string;
  recommended: boolean;
};
export type BrainSizes = { note: string; sizes: readonly BrainSize[] };

export type BrainSourceOption = {
  id: string;
  title: string;
  detail: string;
  dataset?: { name: string; facts: string; fit: string };
};
export type BrainSource = {
  title: string;
  intro: string;
  options: readonly BrainSourceOption[];
  selected: string;
  connections: readonly CheckFact[];
};

export type BrainRegion = { id: string; name: string; detail: string; neurons: number; active: number };
// `note` says what the activity shows: live while Play runs, or the moment of the evaluation it was read at.
export type BrainActivity = { live: boolean; note?: string; regions: readonly BrainRegion[] };
export type Behavior = { id: string; name: string; when: string; detail: string };
export type Wiring = {
  maps: readonly { id: string; name: string; matched: string; detail: string }[];
  unmatched: number;
};

export type BrainPort = {
  getSensesActions: (brain: string) => Promise<SensesActions>;
  toggleInput: (input: { brain: string; id: string }) => Promise<SensesActions>;
  addInput: (brain: string) => Promise<SensesActions>;
  removeInput: (input: { brain: string; id: string }) => Promise<SensesActions>;
  renameInput: (input: { brain: string; id: string; name: string }) => Promise<SensesActions>;
  toggleOutput: (input: { brain: string; id: string }) => Promise<SensesActions>;
  getLearning: (brain: string) => Promise<Learning>;
  setRewardWeight: (input: { brain: string; id: string; weight: number }) => Promise<Learning>;
  getRewardOptions: (brain: string) => Promise<RewardOption[]>;
  addRewardTerm: (input: { brain: string; term: string }) => Promise<Learning>;
  removeRewardTerm: (input: { brain: string; id: string }) => Promise<Learning>;
  getReadings: (brain: string) => Promise<LiveReadings>;
  getShape: (brain: string) => Promise<BrainShape>;
  setLayerSize: (input: { brain: string; id: string; neurons: number }) => Promise<BrainShape>;
  setDecisionsPerSecond: (input: { brain: string; value: number }) => Promise<BrainShape>;
  toggleRule: (input: { brain: string; id: string }) => Promise<BrainShape>;
  addLayer: (brain: string) => Promise<BrainShape>;
  getNetwork: (input: { brain: string; checkpoint?: string }) => Promise<NetworkView>;
  getSizes: (brain: string) => Promise<BrainSizes>;
  chooseSize: (input: { brain: string; id: string }) => Promise<BrainShape>;
  getSource: (brain: string) => Promise<BrainSource>;
  loadSource: (input: { brain: string; id: string }) => Promise<void>;
  getActivity: (brain: string) => Promise<BrainActivity>;
  getBehaviors: (brain: string) => Promise<Behavior[]>;
  getWiring: (brain: string) => Promise<Wiring>;
  // Calls back whenever the brain playing the project changes what it computes or stops; the function stops it.
  watchLive: (brain: string, onChange: () => void) => () => void;
};

export const brainPort = definePort<BrainPort>({
  app: {
    ...createEngineBrainPort(engineApi),
    ...createEngineBrainShape({ ...engineApi, ...brainNetworkApi }),
    ...createEngineNetwork({ ...engineApi, ...brainNetworkApi }),
    ...createEngineBrainActivity({ ...engineApi, ...brainNetworkApi }),
  },
  prototype: createBrainFixture,
});
