import "dockview-react/dist/styles/dockview.css";
import "./dock-theme.css";
import {
  type DockviewApi,
  DockviewReact,
  type DockviewTheme,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
} from "dockview-react";
import { GripVertical } from "lucide-react";
import { createContext, type DragEvent, type PointerEvent, useContext, useEffect, useId, useState } from "react";
import { DockedPanelContext, useDockSlots } from "../../../ui/dock-slot.ts";
import { panelTabClass } from "../../../ui/panel.tsx";
import { applyDefaultLayout, DockMemory, type DockPanels, restoreLayout, saveLayout } from "./dock-layout.ts";
import { DockMenu } from "./dock-menu.tsx";

type Props = {
  panels: DockPanels;
  // The saved arrangement to restore; the default layout is used when there is none.
  storage: string;
  onReady: (api: DockviewApi) => void;
};

const THEME: DockviewTheme = { name: "icarus", className: "dockview-theme-icarus", gap: 12, colorScheme: "dark" };

// `dock` scopes slot names: a leaving and an entering workspace can dock panels with the same ids.
const PanelsContext = createContext<{ panels: DockPanels; dock: string }>({ panels: {}, dock: "" });

// Workspace panels as dockable tabs: drag tabs between groups, split, resize, float or pop out a group.
export function DockWorkspace({ panels, storage, onReady }: Props) {
  const [api, setApi] = useState<DockviewApi | null>(null);
  const dock = useId();
  const remember = useContext(DockMemory);
  // biome-ignore lint/correctness/useExhaustiveDependencies: panels' content changes every render; only a new storage key re-arranges them.
  useEffect(() => {
    if (!api) {
      return;
    }
    api.clear();
    if (!(remember && restoreLayout(api, storage))) {
      applyDefaultLayout(api, panels);
    }
    onReady(api);
    const saving = api.onDidLayoutChange(() => remember && saveLayout(api, storage));
    return () => saving.dispose();
  }, [api, storage, onReady, remember]);
  return (
    <PanelsContext.Provider value={{ panels, dock }}>
      <div className="h-full" onPointerDownCapture={rememberGrip} onDragStartCapture={dragOnlyFromGrip}>
        <DockviewReact
          className="h-full"
          theme={THEME}
          components={COMPONENTS}
          defaultTabComponent={DockTab}
          rightHeaderActionsComponent={DockActions}
          popoutUrl="popout.html"
          onReady={(event) => setApi(event.api)}
        />
      </div>
    </PanelsContext.Provider>
  );
}

// Only the grip moves a panel; dragging a tab's label or an empty header does nothing.
let pressedGrip = false;

function rememberGrip(event: PointerEvent<HTMLDivElement>): void {
  pressedGrip = event.target instanceof Element && event.target.closest("[data-dock-grip]") !== null;
}

function dragOnlyFromGrip(event: DragEvent<HTMLDivElement>): void {
  if (!pressedGrip) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function DockContent({ api }: IDockviewPanelProps) {
  const { panels, dock } = useContext(PanelsContext);
  const panel = panels[api.id];
  if (!panel) {
    return null;
  }
  return (
    <DockedPanelContext.Provider value={{ id: `${dock}:${api.id}` }}>{panel.render()}</DockedPanelContext.Provider>
  );
}

const COMPONENTS = { panel: DockContent };

function DockTab({ api }: IDockviewPanelHeaderProps) {
  const setSlot = useDockSlots((state) => state.setSlot);
  const { dock } = useContext(PanelsContext);
  const [visible, setVisible] = useState(api.isVisible);
  useEffect(() => {
    const listener = api.onDidVisibilityChange((event) => setVisible(event.isVisible));
    return () => listener.dispose();
  }, [api]);
  return (
    <span className="flex min-w-0 items-center gap-0.5">
      <span
        data-dock-grip
        title="Drag to move this panel"
        className="grid h-6 w-4 cursor-grab place-items-center rounded-bar text-fg-disabled hover:bg-fill-hover hover:text-fg-secondary active:cursor-grabbing"
      >
        <GripVertical size={14} strokeWidth={1.75} aria-hidden />
      </span>
      {/* The visible panel draws its own tabs here; otherwise, or for plain content, the title stands in. */}
      <span
        ref={(element) => setSlot("tabs", `${dock}:${api.id}`, element)}
        hidden={!visible}
        data-tabs-slot
        className="contents"
      />
      <span className={`${panelTabClass(visible)} [[data-tabs-slot]:not(:empty):not([hidden])+&]:hidden`}>
        {api.title}
      </span>
    </span>
  );
}

function DockActions({ api, containerApi, group, activePanel }: IDockviewHeaderActionsProps) {
  const setSlot = useDockSlots((state) => state.setSlot);
  const { panels, dock } = useContext(PanelsContext);
  return (
    <div className="flex h-full items-center gap-1 pr-2">
      {activePanel ? (
        <div
          ref={(element) => setSlot("options", `${dock}:${activePanel.id}`, element)}
          className="flex items-center"
        />
      ) : null}
      <DockMenu
        label={(activePanel && panels[activePanel.id]?.optionsLabel) ?? "Panel options"}
        api={api}
        containerApi={containerApi}
        group={group}
        activePanel={activePanel}
      />
    </div>
  );
}
