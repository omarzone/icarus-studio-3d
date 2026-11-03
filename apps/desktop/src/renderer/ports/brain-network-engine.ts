import type { BrainNetworkApi } from "../engine-client/brain-network-api.ts";
import type { EngineApi } from "../engine-client/engine-api.ts";
import { checkpointLabel, networkView } from "./brain-network-views.ts";
import type { BrainPort, NetworkView } from "./brain-port.ts";

type NetworkSources = Pick<EngineApi, "runs" | "checkpoints"> & Pick<BrainNetworkApi, "network" | "activations">;

const EMPTY: NetworkView = { checkpoints: [], checkpoint: "", columns: [], links: [], name: "", summary: "" };

// The network of the project's newest run with checkpoints: the brain key is the project id.
export function createEngineNetwork(api: NetworkSources): Pick<BrainPort, "getNetwork"> {
  return {
    getNetwork: async ({ brain, checkpoint }) => {
      for (const run of await api.runs(brain)) {
        const steps = (await api.checkpoints(run.run_id)).map((item) => item.step);
        if (steps.length === 0) {
          continue;
        }
        const labels = steps.map(checkpointLabel);
        const chosen = steps[labels.indexOf(checkpoint ?? "")] ?? run.best_step ?? steps[steps.length - 1] ?? 0;
        const [network, activations] = await Promise.all([
          api.network(run.run_id, chosen),
          api.activations(run.run_id, chosen),
        ]);
        return networkView({
          name: run.name,
          network,
          activations,
          checkpoints: labels,
          checkpoint: checkpointLabel(chosen),
        });
      }
      return EMPTY;
    },
  };
}
