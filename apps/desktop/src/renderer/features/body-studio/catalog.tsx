import type { Catalog } from "../../app/navigation/route-registry.ts";
import { AutoRigDialog } from "./auto-rig-dialog.tsx";
import { BodyScreen } from "./body-screen.tsx";
import { ImportDialog } from "./import-dialog.tsx";
import { RigCheckPanel } from "./rig-check/rig-check-panel.tsx";

export const catalog: Catalog = {
  routes: [
    { id: "SCR-BODY", maxDiff: 0.045, component: BodyScreen },
    { id: "STA-BODY-CHECK-FAILED", maxDiff: 0.045, component: BodyScreen },
    { id: "MOD-IMPORT", maxDiff: 0.03, over: "SCR-BODY", component: ImportDialog },
    { id: "MOD-AUTO-RIG", maxDiff: 0.045, over: "SCR-BODY", component: AutoRigDialog },
  ],
  modules: [
    {
      id: "PNL-RIG-CHECK",
      component: () => (
        <div className="flex w-200 flex-col p-3">
          <RigCheckPanel body="dance-copy" scene="dance-copy-rig" />
        </div>
      ),
    },
  ],
};
