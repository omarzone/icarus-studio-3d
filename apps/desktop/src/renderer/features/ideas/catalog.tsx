import type { Catalog } from "../../app/navigation/route-registry.ts";
import { IdeasPanel } from "./ideas-panel.tsx";
import { IdeasScreen } from "./ideas-screen.tsx";

export const catalog: Catalog = {
  routes: [{ id: "SCR-IDEAS", maxDiff: 0.045, component: IdeasScreen }],
  modules: [
    {
      id: "PNL-IDEAS",
      component: () => (
        <div className="flex h-[900px] w-[1060px] flex-col p-3">
          <IdeasPanel />
        </div>
      ),
    },
  ],
};
