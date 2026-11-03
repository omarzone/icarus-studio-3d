import type { EditOperation, LibraryCatalog, Project } from "@icarus/contracts";
import type { EngineApi } from "../engine-client/engine-api.ts";
import type { BrainPort } from "./brain-port.ts";
import {
  addRayOperation,
  addTermOperation,
  learningView,
  removeInputOperation,
  renameInputOperation,
  rewardOptions,
  sensesActions,
  toggleOperation,
  weightOperation,
} from "./brain-views.ts";

type BrainApi = Pick<EngineApi, "project" | "library" | "applyOperations">;

export type EngineBrainPort = Pick<
  BrainPort,
  | "getSensesActions"
  | "toggleInput"
  | "toggleOutput"
  | "addInput"
  | "removeInput"
  | "renameInput"
  | "getLearning"
  | "setRewardWeight"
  | "getRewardOptions"
  | "addRewardTerm"
  | "removeRewardTerm"
>;

// The brain's senses, actions and reward on the engine: the brain key is the project id.
export function createEngineBrainPort(api: BrainApi): EngineBrainPort {
  let catalog: Promise<LibraryCatalog> | undefined;
  const library = () => {
    catalog ??= api.library().catch((error: unknown) => {
      catalog = undefined;
      throw error;
    });
    return catalog;
  };
  const load = async (brain: string) => {
    const [state, lib] = await Promise.all([api.project(brain), library()]);
    return { project: state.project, catalog: lib };
  };
  const apply = async (
    brain: string,
    build: (project: Project, lib: LibraryCatalog) => EditOperation,
    summary: string,
  ) => {
    const { project, catalog: lib } = await load(brain);
    const state = await api.applyOperations(brain, [build(project, lib)], summary);
    return { project: state.project, catalog: lib };
  };
  const edit = async (...args: Parameters<typeof apply>) => {
    const { project, catalog: lib } = await apply(...args);
    return learningView(project, lib);
  };
  const sense = async (...args: Parameters<typeof apply>) => {
    const { project, catalog: lib } = await apply(...args);
    return sensesActions(project, lib);
  };
  return {
    getSensesActions: async (brain) => {
      const { project, catalog: lib } = await load(brain);
      return sensesActions(project, lib);
    },
    toggleInput: ({ brain, id }) =>
      sense(brain, (project) => toggleOperation(project, "senses", id), "Turned a sense on or off"),
    toggleOutput: ({ brain, id }) =>
      sense(brain, (project) => toggleOperation(project, "motors", id), "Turned a motor on or off"),
    addInput: (brain) => sense(brain, addRayOperation, "Added a distance ray"),
    removeInput: ({ brain, id }) =>
      sense(brain, (project) => removeInputOperation(project, id), "Removed a sensor from the body"),
    renameInput: ({ brain, id, name }) =>
      sense(brain, (project) => renameInputOperation(project, id, name), `Named a sensor ${name.trim()}`),
    getLearning: async (brain) => {
      const { project, catalog: lib } = await load(brain);
      return learningView(project, lib);
    },
    setRewardWeight: ({ brain, id, weight }) =>
      edit(brain, (project, lib) => weightOperation(project, lib, id, weight), `Changed the ${id} weight`),
    getRewardOptions: async (brain) => {
      const { project, catalog: lib } = await load(brain);
      return rewardOptions(project, lib);
    },
    addRewardTerm: ({ brain, term }) =>
      edit(brain, (project, lib) => addTermOperation(project, lib, term), `Added ${term} to the reward`),
    removeRewardTerm: ({ brain, id }) =>
      edit(brain, () => ({ op: "remove_reward_term", term: id }), `Removed ${id} from the reward`),
  };
}
