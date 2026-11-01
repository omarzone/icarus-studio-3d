import type { DockviewApi } from "dockview-react";
import { useState } from "react";
import { WorkspaceHeader, type WorkspaceHeaderProps } from "../workspace-header/workspace-header.tsx";
import { type DockPanels, storageKey } from "./dock-layout.ts";
import { DockLayoutMenu } from "./dock-layout-menu.tsx";
import { DockWorkspace } from "./dock-workspace.tsx";

type Props = {
  header: WorkspaceHeaderProps;
  layoutKey: string;
  panels: DockPanels;
};

// Workspace shell whose panels can be rearranged; the header stays fixed above them.
export function DockWorkspaceShell({ header, layoutKey, panels }: Props) {
  const [api, setApi] = useState<DockviewApi | null>(null);
  return (
    <div className="grid h-full grid-rows-[52px_minmax(0,1fr)] border border-line-strong bg-app text-fg">
      <WorkspaceHeader {...header} layoutMenu={<DockLayoutMenu api={api} panels={panels} />} />
      <div className="min-h-0 px-3 pb-3">
        <DockWorkspace panels={panels} storage={storageKey(layoutKey, panels)} onReady={setApi} />
      </div>
    </div>
  );
}
