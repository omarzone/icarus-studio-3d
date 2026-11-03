import type {
  BrainActivations,
  BrainBehaviors,
  BrainNetwork,
  BrainReadings,
  BrainSizes,
  BrainSources,
} from "@icarus/contracts";
import {
  isBrainActivations,
  isBrainBehaviors,
  isBrainNetwork,
  isBrainReadings,
  isBrainSizes,
  isBrainSources,
} from "./brain-network-checks.ts";
import { request } from "./request.ts";

// A checkpoint's policy network on the engine: its layers, what every neuron computes, what it senses and does,
// how its evaluation episodes went; and the sizes and trained brains a project can choose from.

const at = (runId: string, path: string, step: number) => `/runs/${encodeURIComponent(runId)}/${path}?step=${step}`;
const brain = (project: string, path: string) => `/projects/${encodeURIComponent(project)}/brain/${path}`;

export const brainNetworkApi = {
  network: (runId: string, step: number): Promise<BrainNetwork> =>
    request(at(runId, "network", step), {}, isBrainNetwork),
  activations: (runId: string, step: number): Promise<BrainActivations> =>
    request(at(runId, "activations", step), {}, isBrainActivations),
  readings: (runId: string, step: number): Promise<BrainReadings> =>
    request(at(runId, "readings", step), {}, isBrainReadings),
  behaviors: (runId: string, step: number): Promise<BrainBehaviors> =>
    request(at(runId, "behaviors", step), {}, isBrainBehaviors),
  sizes: (project: string): Promise<BrainSizes> => request(brain(project, "sizes"), {}, isBrainSizes),
  sources: (project: string): Promise<BrainSources> => request(brain(project, "sources"), {}, isBrainSources),
};

export type BrainNetworkApi = typeof brainNetworkApi;
