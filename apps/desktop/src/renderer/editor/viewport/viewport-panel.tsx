// PNL-VIEWPORT
import { Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import { Panel, PanelTab } from "../../ui/panel.tsx";
import { GameViewTab } from "./game-view-tab.tsx";
import { SceneTab } from "./scene-tab.tsx";
import { ViewportSurface } from "./viewport-surface.tsx";

export type ViewportTab = { id: string; label: string };

export type ViewportPanelProps = {
  // What the view shows, read by assistive technology ("Parking lot under a dusk sky").
  label: string;
  // Tabs of the view; "scene" and "game-view" have their own tab files, other ids draw a plain surface.
  tabs?: readonly ViewportTab[];
  // View options on the right of the tab bar (Lit, Perspective, speed).
  viewOptions?: readonly string[];
  // Plain note before the view options ("Tools follow its senses").
  note?: string;
  // PNL-TOOLBAR strip drawn between the tab bar and the view.
  toolbar?: ReactNode;
  // Cards, pills and buttons floating over the view; they position themselves (see viewport-overlays.tsx).
  overlays?: ReactNode;
  tint?: "proposal";
  className?: string;
};

export const DEFAULT_VIEWPORT_TABS: readonly ViewportTab[] = [
  { id: "scene", label: "Scene" },
  { id: "game-view", label: "Game view" },
];

const DEFAULT_OPTIONS = ["Lit", "Perspective"] as const;

export function ViewportPanel({
  label,
  tabs = DEFAULT_VIEWPORT_TABS,
  viewOptions = DEFAULT_OPTIONS,
  note,
  toolbar,
  overlays,
  tint,
  className = "flex-1",
}: ViewportPanelProps) {
  const [active, setActive] = useState(tabs[0]?.id ?? "scene");
  const surface = { label, tint, overlays };
  return (
    <Panel
      id="PNL-VIEWPORT"
      className={className}
      tabs={
        <>
          {tabs.map((tab) => (
            <PanelTab key={tab.id} label={tab.label} active={tab.id === active} onSelect={() => setActive(tab.id)} />
          ))}
          <Act
            cta="Add a view"
            aria-label="Add a view"
            title="Split the view"
            className="grid h-6.5 place-items-center rounded-control px-2.5 text-fg-tertiary hover:bg-fill-hover hover:text-fg"
          >
            <Plus size={12} strokeWidth={1.75} aria-hidden />
          </Act>
        </>
      }
      options={
        <>
          {note ? <span className="mr-1 text-ui text-fg-tertiary">{note}</span> : null}
          {viewOptions.map((option) => (
            <Act
              key={option}
              cta={option}
              className="rounded-control bg-control px-2 py-0.75 text-ui text-fg-tertiary hover:bg-control-raised hover:text-fg"
            >
              {option}
            </Act>
          ))}
        </>
      }
    >
      <div className="flex h-full flex-col">
        {toolbar}
        {active === "scene" ? (
          <SceneTab {...surface} />
        ) : active === "game-view" ? (
          <GameViewTab {...surface} />
        ) : (
          <ViewportSurface {...surface} />
        )}
      </div>
    </Panel>
  );
}
