import type { BrainNetwork } from "@icarus/contracts";
import type { BrainNetworkApi } from "../engine-client/brain-network-api.ts";
import type { EngineApi } from "../engine-client/engine-api.ts";
import { liveActivations } from "./brain-activity-views.ts";
import { checkpointLabel, LIVE, networkView } from "./brain-network-views.ts";
import type { BrainPort, NetworkView } from "./brain-port.ts";
import { type LiveBrains, liveBrains } from "./live-brain.ts";

type NetworkSources = Pick<EngineApi, "runs" | "checkpoints"> & Pick<BrainNetworkApi, "network" | "activations">;

const EMPTY: NetworkView = { checkpoints: [], checkpoint: "", columns: [], links: [], name: "", summary: "" };

// A checkpoint's network never changes, so live views ask the engine for it once, not with every activity.
export function networkMemo(
  api: Pick<BrainNetworkApi, "network">,
): (runId: string, step: number) => Promise<BrainNetwork> {
  const known = new Map<string, Promise<BrainNetwork>>();
  return (runId, step) => {
    const key = `${runId}@${step}`;
    const cached = known.get(key);
    if (cached) {
      return cached;
    }
    const loading = api.network(runId, step);
    known.set(key, loading);
    loading.catch(() => known.delete(key));
    return loading;
  };
}

// The network of the project's newest run with checkpoints: the brain key is the project id. While Play runs a trained
// brain, `Live` (and no choice) shows that brain lit by what it computes now.
export function createEngineNetwork(api: NetworkSources, live: LiveBrains = liveBrains): Pick<BrainPort, "getNetwork"> {
  const network = networkMemo(api);
  // The saved checkpoints the view offered last, so a live update does not ask for the run list again.
  const offered = new Map<string, { runId: string; name: string; labels: readonly string[] }>();
  const snapshot = async (brain: string, checkpoint: string | undefined): Promise<NetworkView> => {
    for (const run of await api.runs(brain)) {
      const steps = (await api.checkpoints(run.run_id)).map((item) => item.step);
      if (steps.length === 0) {
        continue;
      }
      const labels = steps.map(checkpointLabel);
      offered.set(brain, { runId: run.run_id, name: run.name, labels });
      const chosen = steps[labels.indexOf(checkpoint ?? "")] ?? run.best_step ?? steps[steps.length - 1] ?? 0;
      const [shape, activations] = await Promise.all([
        network(run.run_id, chosen),
        api.activations(run.run_id, chosen),
      ]);
      return networkView({
        name: run.name,
        network: shape,
        activations,
        checkpoints: [LIVE, ...labels],
        checkpoint: checkpointLabel(chosen),
      });
    }
    return EMPTY;
  };
  return {
    getNetwork: async ({ brain, checkpoint }) => {
      const playing = live.current(brain);
      if (!playing || (checkpoint !== undefined && checkpoint !== LIVE)) {
        return snapshot(brain, checkpoint === LIVE ? undefined : checkpoint);
      }
      if (!offered.has(brain)) {
        await snapshot(brain, undefined);
      }
      const known = offered.get(brain);
      return networkView({
        name: known?.runId === playing.runId ? known.name : playing.brain,
        network: await network(playing.runId, playing.step),
        activations: liveActivations(playing),
        checkpoints: [LIVE, ...(known?.labels ?? [])],
        checkpoint: LIVE,
        live: true,
      });
    },
  };
}
