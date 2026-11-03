import type { BrainNetworkApi } from "../engine-client/brain-network-api.ts";
import type { EngineApi } from "../engine-client/engine-api.ts";
import {
  activityView,
  behaviorsView,
  type Checkpoint,
  NO_READINGS,
  readingsView,
  sourceOperation,
  sourceView,
  wiringView,
} from "./brain-activity-views.ts";
import type { BrainPort } from "./brain-port.ts";
import { sensesActions } from "./brain-views.ts";

type ActivityApi = Pick<EngineApi, "runs" | "checkpoints" | "project" | "library" | "applyOperations"> &
  Pick<BrainNetworkApi, "network" | "activations" | "readings" | "behaviors" | "sources">;

export type EngineBrainActivity = Pick<
  BrainPort,
  "getReadings" | "getActivity" | "getBehaviors" | "getWiring" | "getSource" | "loadSource"
>;

// What the newest trained brain of the project senses, computes and did in its test tries, how it is wired to the
// body, and the trained brains the body can start from; the brain key is the project id.
export function createEngineBrainActivity(api: ActivityApi): EngineBrainActivity {
  // The best checkpoint of the newest run that saved one, or null before any brain was trained.
  const newest = async (brain: string): Promise<Checkpoint | null> => {
    for (const run of await api.runs(brain)) {
      const steps = (await api.checkpoints(run.run_id)).map((item) => item.step);
      if (steps.length > 0) {
        const step = run.best_step !== null && run.best_step !== undefined ? run.best_step : (steps.at(-1) ?? 0);
        return { runId: run.run_id, runName: run.name, step };
      }
    }
    return null;
  };
  return {
    getReadings: async (brain) => {
      const checkpoint = await newest(brain);
      return checkpoint ? readingsView(await api.readings(checkpoint.runId, checkpoint.step), checkpoint) : NO_READINGS;
    },
    getActivity: async (brain) => {
      const checkpoint = await newest(brain);
      if (!checkpoint) {
        return { live: false, regions: [] };
      }
      const [network, activations] = await Promise.all([
        api.network(checkpoint.runId, checkpoint.step),
        api.activations(checkpoint.runId, checkpoint.step),
      ]);
      return activityView(network, activations);
    },
    getBehaviors: async (brain) => {
      const checkpoint = await newest(brain);
      return checkpoint ? behaviorsView(await api.behaviors(checkpoint.runId, checkpoint.step)) : [];
    },
    getWiring: async (brain) => {
      const [state, catalog, checkpoint] = await Promise.all([api.project(brain), api.library(), newest(brain)]);
      const { inputs, outputs } = sensesActions(state.project, catalog);
      const network = checkpoint ? await api.network(checkpoint.runId, checkpoint.step) : null;
      const off = (items: readonly { enabled: boolean }[]) => items.filter((item) => !item.enabled).length;
      return wiringView(
        { total: inputs.length, muted: off(inputs) },
        { total: outputs.length, muted: off(outputs) },
        network?.outputs.length ?? 0,
      );
    },
    getSource: async (brain) => sourceView(await api.sources(brain)),
    loadSource: async ({ brain, id }) => {
      await api.applyOperations(brain, [sourceOperation(id)], "Chose the brain that drives the body");
    },
  };
}
