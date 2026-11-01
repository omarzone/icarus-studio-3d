import type { DockviewApi, DockviewGroupPanel, DockviewGroupPanelApi, IDockviewPanel } from "dockview-react";
import { AppWindow, Ellipsis, Maximize2, Minimize2, PictureInPicture2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonClass } from "../../../ui/button-styles.ts";
import { MenuButton, type MenuEntry } from "../../../ui/menu.tsx";

type Props = {
  // Accessible name of the ⋯ button; panels that had their own options menu keep its name.
  label: string;
  api: DockviewGroupPanelApi;
  containerApi: DockviewApi;
  group: DockviewGroupPanel;
  activePanel: IDockviewPanel | undefined;
};

// The panel's ⋯ menu: where the panel can go (maximize, float, its own window) and closing it.
export function DockMenu({ label, api, containerApi, group, activePanel }: Props) {
  const [maximized, setMaximized] = useState(api.isMaximized());
  useEffect(() => {
    const listener = containerApi.onDidMaximizedGroupChange(() => setMaximized(api.isMaximized()));
    return () => listener.dispose();
  }, [api, containerApi]);
  const location = api.location.type;
  const entries: MenuEntry[] = [];
  if (location === "grid") {
    entries.push(
      maximized
        ? { label: "Restore", hint: "Back to its place", icon: Minimize2, run: () => api.exitMaximized() }
        : { label: "Maximize", hint: "Fill the workspace", icon: Maximize2, run: () => api.maximize() },
      {
        label: "Float",
        hint: "Move it freely over the workspace",
        icon: PictureInPicture2,
        run: () => containerApi.addFloatingGroup(group),
      },
    );
  }
  if (location !== "popout") {
    entries.push({
      label: "Open in a new window",
      hint: "Put it on another screen; closing the window brings it back",
      icon: AppWindow,
      run: () => void containerApi.addPopoutGroup(group),
    });
  }
  if (activePanel) {
    entries.push(
      { divider: true, key: "close" },
      {
        label: "Close",
        hint: "Open it again from Panels in the header",
        icon: X,
        run: () => containerApi.removePanel(activePanel),
      },
    );
  }
  return (
    <MenuButton label={label} entries={entries} className={buttonClass("icon", "size-6!")}>
      <Ellipsis size={14} strokeWidth={1.75} aria-hidden />
    </MenuButton>
  );
}
