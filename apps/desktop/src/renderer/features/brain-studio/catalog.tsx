import type { Catalog } from "../../app/navigation/route-registry.ts";
import { BrainActivityPanel } from "../../editor/brain-activity/brain-activity-panel.tsx";
import { BrainScreen } from "./brain-screen.tsx";
import { BrainShapePanel } from "./brain-shape/brain-shape-panel.tsx";
import { LearningPanel } from "./learning/learning-panel.tsx";
import { SensesActionsPanel } from "./senses-actions/senses-actions-panel.tsx";
import { SizesDialog } from "./sizes-dialog.tsx";
import { SourceDialog } from "./source-dialog.tsx";

export const catalog: Catalog = {
  routes: [
    { id: "SCR-BRAIN", maxDiff: 0.03, component: BrainScreen },
    { id: "STA-BRAIN-NETWORK", maxDiff: 0.03, component: BrainScreen },
    { id: "STA-BRAIN-CONNECTOME", maxDiff: 0.03, component: BrainScreen },
    { id: "MOD-BRAIN-SIZES", maxDiff: 0.04, over: "STA-BRAIN-NETWORK", component: SizesDialog },
    { id: "MOD-BRAIN-SOURCE", maxDiff: 0.03, over: "STA-BRAIN-CONNECTOME", component: SourceDialog },
  ],
  modules: [
    {
      id: "PNL-SENSES-ACTIONS",
      component: () => (
        <div className="flex h-100 w-63 flex-col p-3">
          <SensesActionsPanel brain="park-pilot" />
        </div>
      ),
    },
    {
      id: "PNL-LEARNING",
      component: () => (
        <div className="flex w-200 flex-col p-3">
          <LearningPanel brain="park-pilot" />
        </div>
      ),
    },
    {
      id: "PNL-BRAIN-SHAPE",
      component: () => (
        <div className="flex h-210 w-63 flex-col p-3">
          <BrainShapePanel brain="park-pilot" />
        </div>
      ),
    },
    {
      id: "PNL-BRAIN-ACTIVITY",
      component: () => (
        <div className="flex w-200 flex-col p-3">
          <BrainActivityPanel brain="fruit-fly" />
        </div>
      ),
    },
  ],
};
