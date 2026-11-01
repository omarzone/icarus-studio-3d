import type { ReactNode } from "react";
import type { Catalog } from "../../app/navigation/route-registry.ts";
import { AutopilotDialog } from "./autopilot-dialog.tsx";
import { MetricsPanel } from "./metrics/metrics-panel.tsx";
import { RunsPanel } from "./runs/runs-panel.tsx";
import { StartTrainingDialog } from "./start-training-dialog.tsx";
import { StopRunDialog } from "./stop-run-dialog.tsx";
import { TrainScreen } from "./train-screen.tsx";

function Column({ width, children }: { width: string; children: ReactNode }) {
  return <div className={`flex h-[900px] flex-col gap-2.5 p-3 ${width}`}>{children}</div>;
}

export const catalog: Catalog = {
  routes: [
    { id: "SCR-TRAIN", maxDiff: 0.045, component: TrainScreen },
    { id: "STA-TRAIN-FAILED", maxDiff: 0.045, component: TrainScreen },
    { id: "MOD-START-TRAINING", maxDiff: 0.045, over: "SCR-BRAIN", component: StartTrainingDialog },
    { id: "MOD-STOP-RUN", maxDiff: 0.045, over: "SCR-TRAIN", component: StopRunDialog },
    { id: "MOD-AUTOPILOT", maxDiff: 0.045, over: "SCR-TRAIN", component: AutopilotDialog },
  ],
  modules: [
    {
      id: "PNL-RUNS",
      component: () => (
        <Column width="w-69">
          <RunsPanel project="park-pilot" />
        </Column>
      ),
    },
    {
      id: "PNL-METRICS",
      component: () => (
        <Column width="w-200">
          <MetricsPanel project="park-pilot" />
        </Column>
      ),
    },
  ],
};
