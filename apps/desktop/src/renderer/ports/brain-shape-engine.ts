import type { EditOperation, Project } from "@icarus/contracts";
import type { BrainNetworkApi } from "../engine-client/brain-network-api.ts";
import type { EngineApi } from "../engine-client/engine-api.ts";
import type { BrainPort } from "./brain-port.ts";
import {
  addLayerOperation,
  decisionsOperation,
  layerOperation,
  ruleOperation,
  shapeView,
  sizeOperation,
  sizesView,
} from "./brain-shape-views.ts";

type ShapeApi = Pick<EngineApi, "project" | "applyOperations"> & Pick<BrainNetworkApi, "sizes">;

export type EngineBrainShape = Pick<
  BrainPort,
  "getShape" | "setLayerSize" | "setDecisionsPerSecond" | "toggleRule" | "addLayer" | "getSizes" | "chooseSize"
>;

// The brain's layers, decision rate and episode rules on the engine, changed by set_brain and set_episode.
export function createEngineBrainShape(api: ShapeApi): EngineBrainShape {
  const apply = async (brain: string, build: (project: Project) => EditOperation, summary: string) => {
    const operation = build((await api.project(brain)).project);
    return shapeView((await api.applyOperations(brain, [operation], summary)).project);
  };
  return {
    getShape: async (brain) => shapeView((await api.project(brain)).project),
    setLayerSize: ({ brain, id, neurons }) =>
      apply(brain, (project) => layerOperation(project, id, neurons), `Set ${id.replace("-", " ")} to ${neurons}`),
    setDecisionsPerSecond: ({ brain, value }) =>
      apply(brain, () => decisionsOperation(value), "Changed how often the brain decides"),
    toggleRule: ({ brain, id }) => apply(brain, (project) => ruleOperation(project, id), "Changed an episode rule"),
    addLayer: (brain) => apply(brain, addLayerOperation, "Added a layer to the brain"),
    getSizes: async (brain) => sizesView(await api.sizes(brain)),
    chooseSize: async ({ brain, id }) => {
      const sizes = await api.sizes(brain);
      return apply(brain, () => sizeOperation(sizes, id), `Chose the ${id} brain`);
    },
  };
}
