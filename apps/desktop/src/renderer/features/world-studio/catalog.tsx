import type { Catalog } from "../../app/navigation/route-registry.ts";
import { AddComponentBoard } from "./add-component-board.tsx";
import { LibraryPanel } from "./library/library-panel.tsx";
import { TrainingCopiesPopover } from "./training-copies-popover.tsx";
import { WorldScreen } from "./world-screen.tsx";

export const catalog: Catalog = {
  routes: [
    { id: "SCR-WORLD", maxDiff: 0.03, component: WorldScreen },
    { id: "STA-WORLD-EMPTY", maxDiff: 0.03, component: WorldScreen },
    { id: "STA-WORLD-EMPTY-NOGUIDE", maxDiff: 0.03, component: WorldScreen },
    { id: "STA-WORLD-BUILDING", maxDiff: 0.03, component: WorldScreen },
    { id: "STA-WORLD-PROPOSAL", maxDiff: 0.03, component: WorldScreen },
    { id: "POP-TRAINING-COPIES", maxDiff: 0.03, over: "SCR-WORLD", component: TrainingCopiesPopover },
    { id: "POP-ADD-COMPONENT", maxDiff: 0.03, over: "SCR-WORLD", component: AddComponentBoard },
  ],
  modules: [
    {
      id: "PNL-LIBRARY",
      component: () => (
        <div className="flex w-200 flex-col p-3">
          <LibraryPanel scene="park-pilot" importLabel="Import environment .glb .fbx .usd" />
        </div>
      ),
    },
  ],
};
