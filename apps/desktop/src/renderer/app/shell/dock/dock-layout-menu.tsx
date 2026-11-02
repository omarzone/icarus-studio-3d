import type { DockviewApi } from "dockview-react";
import { PanelsTopLeft, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonClass } from "../../../ui/button-styles.ts";
import { MenuButton, type MenuEntry } from "../../../ui/menu.tsx";
import { addPanelHome, applyDefaultLayout, type DockPanels } from "./dock-layout.ts";

type Props = { api: DockviewApi | null; panels: DockPanels };

// Panels menu in the workspace header: show or hide each panel, or go back to the default arrangement.
export function DockLayoutMenu({ api, panels }: Props) {
  const [open, setOpen] = useState<readonly string[]>([]);
  useEffect(() => {
    if (!api) {
      return;
    }
    const refresh = () => setOpen(api.panels.map((panel) => panel.id));
    refresh();
    const added = api.onDidAddPanel(refresh);
    const removed = api.onDidRemovePanel(refresh);
    return () => {
      added.dispose();
      removed.dispose();
    };
  }, [api]);
  const entries: MenuEntry[] = api
    ? [
        ...Object.entries(panels).map(([id, panel]) => {
          const shown = open.includes(id);
          return {
            label: panel.title,
            checked: shown,
            run: () => {
              const existing = api.getPanel(id);
              if (existing) {
                api.removePanel(existing);
              } else {
                addPanelHome(api, id, panel);
              }
            },
          };
        }),
        { divider: true, key: "reset" },
        {
          label: "Reset layout",
          hint: "Every panel back to its default place",
          icon: RotateCcw,
          run: () => applyDefaultLayout(api, panels),
        },
      ]
    : [];
  return (
    <MenuButton label="Panels" entries={entries} className={buttonClass("ghost", "gap-1.5")}>
      <PanelsTopLeft size={14} strokeWidth={1.75} aria-hidden />
      <span className="max-[1360px]:hidden">Panels</span>
    </MenuButton>
  );
}
