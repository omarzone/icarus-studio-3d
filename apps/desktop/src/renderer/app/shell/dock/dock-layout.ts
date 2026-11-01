import type { DockviewApi } from "dockview-react";
import { createContext, type ReactNode } from "react";

export type DockPanel = {
  title: string;
  render: () => ReactNode;
  // Name of the ⋯ menu for panels whose design gives it one ("Inspector options").
  optionsLabel?: string;
  // Where the panel sits in the default layout and where it comes back when reopened; the central panel has none.
  home?: {
    direction: "left" | "right" | "above" | "below";
    // Panel to sit next to; the whole workspace when omitted or closed.
    next?: string;
    // Width (left or right) or height (above or below) in pixels.
    size?: number;
  };
  minimumWidth?: number;
  minimumHeight?: number;
  // A full page (hardware setup) shows no tab bar; it stays where the layout puts it.
  bare?: boolean;
};

export type DockPanels = Readonly<Record<string, DockPanel>>;

type Home = NonNullable<DockPanel["home"]>;

// The style guide's workspace columns: a 264 px left column, the copilot on the right, panels stacked below others.
export const HOME = {
  left: { direction: "left", size: 264 },
  copilot: { direction: "right", size: 372 },
  // Views that need a wider center (the network view).
  narrowCopilot: { direction: "right", size: 352 },
  below: (next: string, size?: number): Home => ({ direction: "below", next, size }),
  besides: (next: string, size?: number): Home => ({ direction: "right", next, size }),
} as const satisfies Record<string, Home | ((next: string, size?: number) => Home)>;

// False where every workspace must open in its default layout (the design gallery and its checks).
export const DockMemory = createContext(true);

// Names the saved arrangement; a workspace with different panels saves a different one.
export function storageKey(layoutKey: string, panels: DockPanels): string {
  return `icarus.dock.${layoutKey}.${Object.keys(panels).sort().join("+")}`;
}

export function addPanelHome(api: DockviewApi, id: string, panel: DockPanel): void {
  const home = panel.home;
  const next = home?.next && api.getPanel(home.next) ? home.next : undefined;
  const added = api.addPanel({
    id,
    component: "panel",
    title: panel.title,
    minimumWidth: panel.minimumWidth ?? 220,
    minimumHeight: panel.minimumHeight ?? 110,
    position: home
      ? next
        ? { referencePanel: next, direction: home.direction }
        : { direction: home.direction }
      : undefined,
  });
  if (panel.bare) {
    added.group.header.hidden = true;
  }
  sizeAtHome(api, id, panel);
}

function sizeAtHome(api: DockviewApi, id: string, panel: DockPanel): void {
  const home = panel.home;
  const group = api.getPanel(id)?.group;
  if (!home?.size || !group) {
    return;
  }
  const sideways = home.direction === "left" || home.direction === "right";
  group.api.setSize(sideways ? { width: home.size } : { height: home.size });
}

// The workspace design: the panel without a home first, then the others at their homes in declared order.
export function applyDefaultLayout(api: DockviewApi, panels: DockPanels): void {
  api.clear();
  const entries = Object.entries(panels);
  const ordered = [...entries.filter(([, p]) => !p.home), ...entries.filter(([, p]) => p.home)];
  for (const [id, panel] of ordered) {
    addPanelHome(api, id, panel);
  }
  // Sizes go last: every split added later shares space again.
  for (const [id, panel] of ordered) {
    sizeAtHome(api, id, panel);
  }
}

export function restoreLayout(api: DockviewApi, key: string): boolean {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) {
      return false;
    }
    api.fromJSON(JSON.parse(saved));
    return api.panels.length > 0;
  } catch {
    return false;
  }
}

export function saveLayout(api: DockviewApi, key: string): void {
  try {
    localStorage.setItem(key, JSON.stringify(api.toJSON()));
  } catch {
    // Saving the arrangement is a convenience; the default layout still works without it.
  }
}

// The copilot chat every workspace docks on its right.
export function copilotPanel(render: () => ReactNode, narrow = false): DockPanel {
  return {
    title: "Copilot",
    optionsLabel: "Chat options",
    home: narrow ? HOME.narrowCopilot : HOME.copilot,
    minimumWidth: 300,
    render,
  };
}
