import type { BrainActivations, BrainNetwork } from "@icarus/contracts";
import { compactNumber } from "../ui/compact-number.ts";
import type { HotLink, NetworkColumn, NetworkNode, NetworkView, NeuronState } from "./brain-port.ts";

// The diagram has room for this many neurons per column; larger layers show an even sample.
const MAX_NODES = 16;
const MAX_LINKS_PER_COLUMN = 6;

export const checkpointLabel = (step: number): string => compactNumber(step);

export function neuronState(value: number): NeuronState {
  const strength = Math.abs(value);
  if (strength >= 0.66) {
    return "hot";
  }
  return strength >= 0.33 ? "on" : "idle";
}

export function sampledIndexes(size: number, limit: number): number[] {
  if (size <= limit) {
    return Array.from({ length: size }, (_, i) => i);
  }
  return Array.from({ length: limit }, (_, i) => Math.round((i * (size - 1)) / (limit - 1)));
}

function column(label: string, values: readonly number[], size: number, labels?: readonly string[]): NetworkColumn {
  const nodes = sampledIndexes(size, MAX_NODES).map((index): NetworkNode => {
    const name = labels?.[index];
    const state = neuronState(values[index] ?? 0);
    return name === undefined ? { state } : { label: name, state };
  });
  return { label: `${label} · ${size}`, nodes };
}

const hotIndexes = (nodes: readonly NetworkNode[]) => nodes.flatMap((node, i) => (node.state === "hot" ? [i] : []));

function hotLinks(columns: readonly NetworkColumn[]): HotLink[] {
  return columns.slice(0, -1).flatMap((from, index) => {
    const targets = hotIndexes(columns[index + 1]?.nodes ?? []);
    return hotIndexes(from.nodes)
      .flatMap((i) => targets.map((j) => ({ column: index, from: i, to: j })))
      .slice(0, MAX_LINKS_PER_COLUMN);
  });
}

function parameters(network: BrainNetwork): number {
  const sizes = [network.inputs.length, ...network.layers.map((layer) => layer.size), network.outputs.length];
  return sizes.slice(1).reduce((total, size, i) => total + ((sizes[i] ?? 0) + 1) * size, 0);
}

// A checkpoint's real network: neurons lit by what they compute for the first observation of its evaluation.
export function networkView(input: {
  name: string;
  network: BrainNetwork;
  activations: BrainActivations;
  checkpoints: readonly string[];
  checkpoint: string;
}): NetworkView {
  const { network, activations } = input;
  const inputLabels = network.inputs.map((item) => item.label);
  const outputLabels = network.outputs.map((item) => item.label);
  const columns = [
    column("Inputs", activations.observation, network.inputs.length, inputLabels),
    ...network.layers.map((layer, i) => column(layer.name, activations.layers[i] ?? [], layer.size)),
    column("Outputs", activations.outputs, network.outputs.length, outputLabels),
  ];
  const count = network.layers.length;
  const shape = `${count} layer${count === 1 ? "" : "s"} · ${network.layers.map((layer) => layer.size).join(", ")} neurons`;
  return {
    checkpoints: input.checkpoints,
    checkpoint: input.checkpoint,
    columns,
    links: hotLinks(columns),
    name: input.name,
    summary: `${shape} · ${parameters(network).toLocaleString("en-US")} parameters · step ${checkpointLabel(network.step)}`,
  };
}
