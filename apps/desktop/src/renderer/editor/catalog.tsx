import type { ReactNode } from "react";
import type { Catalog } from "../app/navigation/route-registry.ts";
import { ExplorerPanel } from "./explorer/explorer-panel.tsx";
import { InspectorPanel } from "./inspector/inspector-panel.tsx";
import { PropertyReferenceBoard } from "./inspector/property-reference.tsx";
import { Toolbar } from "./viewport/toolbar/toolbar.tsx";
import { WORLD_TOOLS } from "./viewport/toolbar/toolbar-presets.ts";
import { ViewportPanel } from "./viewport/viewport-panel.tsx";

function Column({ width, children }: { width: string; children: ReactNode }) {
  return <div className={`flex h-[900px] flex-col gap-2.5 p-3 ${width}`}>{children}</div>;
}

export const catalog: Catalog = {
  routes: [{ id: "REF-PROPERTY-TYPES", maxDiff: 0.03, component: PropertyReferenceBoard }],
  modules: [
    {
      id: "PNL-EXPLORER",
      component: () => (
        <Column width="w-69">
          <ExplorerPanel scene="park-pilot" />
        </Column>
      ),
    },
    {
      id: "PNL-INSPECTOR",
      component: () => (
        <Column width="w-69">
          <InspectorPanel scene="park-pilot" addComponentTo="POP-ADD-COMPONENT" />
        </Column>
      ),
    },
    {
      id: "PNL-VIEWPORT",
      component: () => (
        <Column width="w-200">
          <ViewportPanel label="The project's world" toolbar={<Toolbar groups={WORLD_TOOLS} selected="Copies" />} />
        </Column>
      ),
    },
    {
      id: "PNL-TOOLBAR",
      component: () => (
        <Column width="w-200">
          <Toolbar groups={WORLD_TOOLS} selected="Copies" />
        </Column>
      ),
    },
  ],
};
