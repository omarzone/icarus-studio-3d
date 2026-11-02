import type { BrainActivations, BrainNetwork } from "@icarus/contracts";
import { isBrainActivations, isBrainNetwork } from "./brain-network-checks.ts";
import { request } from "./request.ts";

// A checkpoint's policy network on the engine: its layers and what every neuron computes.

const at = (runId: string, path: string, step: number) => `/runs/${encodeURIComponent(runId)}/${path}?step=${step}`;

export const brainNetworkApi = {
  network: (runId: string, step: number): Promise<BrainNetwork> =>
    request(at(runId, "network", step), {}, isBrainNetwork),
  activations: (runId: string, step: number): Promise<BrainActivations> =>
    request(at(runId, "activations", step), {}, isBrainActivations),
};

export type BrainNetworkApi = typeof brainNetworkApi;
