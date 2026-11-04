import type { Catalog } from "../../app/navigation/route-registry.ts";
import { BuildScreen } from "./build-screen.tsx";
import { ExportBrainDialog } from "./export-brain-dialog.tsx";
import { PublishDialog } from "./publish-dialog.tsx";
import { PublishedDialog } from "./published-dialog.tsx";
import { BuildTargetViewPanel } from "./target-view/build-target-view-panel.tsx";
import { BuildTargetsPanel } from "./targets/build-targets-panel.tsx";

export const catalog: Catalog = {
  routes: [
    { id: "SCR-BUILD", maxDiff: 0.03, component: BuildScreen },
    { id: "STA-BUILD-HARDWARE", maxDiff: 0.03, component: BuildScreen },
    { id: "MOD-EXPORT-BRAIN", maxDiff: 0.03, over: "SCR-BUILD", component: ExportBrainDialog },
    { id: "MOD-PUBLISH", maxDiff: 0.03, over: "SCR-BUILD", component: PublishDialog },
    { id: "MOD-PUBLISHED", maxDiff: 0.03, over: "SCR-BUILD", component: PublishedDialog },
  ],
  modules: [
    {
      id: "PNL-BUILD-TARGETS",
      component: () => (
        <div className="flex h-125 w-67.5 flex-col p-3">
          <BuildTargetsPanel
            project="park-pilot"
            selected="community"
            routes={{
              "export-brain": "MOD-EXPORT-BRAIN",
              hardware: "STA-BUILD-HARDWARE",
              game: "MOD-EXPORT-BRAIN",
              animation: "MOD-EXPORT-ANIMATION",
            }}
          />
        </div>
      ),
    },
    {
      id: "PNL-BUILD-TARGET-VIEW",
      component: () => (
        <div className="flex h-210 w-197.5 flex-col p-3">
          <BuildTargetViewPanel project="park-pilot" projectName="Park Pilot" revision="" underOverlay={false} />
        </div>
      ),
    },
  ],
};
