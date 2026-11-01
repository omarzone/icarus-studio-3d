// HDR-WORKSPACE
import { tokens } from "@icarus/ui-tokens";
import { ChevronDown, Play } from "lucide-react";
import type { ReactNode } from "react";
import { buttonClass } from "../../../ui/button-styles.ts";
import type { RouteId, ScreenId } from "../../navigation/catalog-id.ts";
import { Act, GoTo } from "../../navigation/go-to.tsx";
import { useTitleBarHeight, WindowControlsSpace } from "../window-frame.tsx";

export type Workspace = "World" | "Body" | "Motion" | "Brain" | "Train" | "Results" | "Build";

const WORKSPACE_ROUTES: Record<Workspace, ScreenId> = {
  World: "SCR-WORLD",
  Body: "SCR-BODY",
  Motion: "SCR-MOTION",
  Brain: "SCR-BRAIN",
  Train: "SCR-TRAIN",
  Results: "SCR-RESULTS",
  Build: "SCR-BUILD",
};

export const DEFAULT_WORKSPACES: readonly Workspace[] = ["World", "Body", "Brain", "Train", "Results", "Build"];

const UNAVAILABLE = "Available once the project exists";

export type WorkspaceHeaderProps = {
  project: string;
  active: Workspace;
  workspaces?: readonly Workspace[];
  // Where the active tab leads; omitted when it acts in place.
  activeGoesTo?: RouteId;
  // "Getting started 2/5" while the guide is active, "Guide" when hidden.
  guide: string;
  playEnabled?: boolean;
  // Where Play leads when the project plays somewhere else (a motion clip, a second example).
  playTo?: RouteId;
  // Destinations of workspace tabs that differ for this project (a connectome brain, reference results).
  routes?: Partial<Record<Workspace, RouteId>>;
  primary: { label: string; to: RouteId; disabled?: boolean };
  // Panels menu of workspaces whose panels can be rearranged.
  layoutMenu?: ReactNode;
};

export function WorkspaceHeader({
  project,
  active,
  workspaces = DEFAULT_WORKSPACES,
  activeGoesTo,
  guide,
  playEnabled = true,
  playTo = "SCR-PLAY",
  routes = {},
  primary,
  layoutMenu,
}: WorkspaceHeaderProps) {
  useTitleBarHeight(tokens.size.headerWorkspace);
  return (
    <header data-ui-id="HDR-WORKSPACE" className="title-bar col-span-full flex h-13 items-center gap-3.5 pr-3.5 pl-4.5">
      {/* A fixed-width project area: the workspace tabs start at the same place in every workspace. */}
      <div className="flex w-76 shrink-0 items-center">
        <WindowControlsSpace side="start" />
        <GoTo
          to="POP-PROJECT-MENU"
          cta={project}
          className="flex h-8 min-w-0 items-center gap-2 rounded-button px-2 text-[14px] font-semibold hover:bg-fill-hover active:opacity-80"
        >
          <span className="truncate">{project}</span>
          <ChevronDown size={12} strokeWidth={1.75} className="shrink-0 text-fg-tertiary" aria-hidden />
        </GoTo>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5 rounded-button bg-control p-[3px]">
          {workspaces.map((name) => {
            const isActive = name === active;
            const className = isActive
              ? "rounded-control bg-selected px-3.5 py-1.5 text-ui font-semibold text-on-selected"
              : "rounded-control px-3.5 py-1.5 text-ui text-fg-tertiary hover:bg-fill-hover hover:text-fg active:opacity-80";
            const to = isActive ? activeGoesTo : (routes[name] ?? WORKSPACE_ROUTES[name]);
            return to ? (
              <GoTo key={name} to={to} cta={name} aria-current={isActive ? "page" : undefined} className={className}>
                <TabLabel name={name} />
              </GoTo>
            ) : (
              <Act key={name} cta={name} aria-current="page" className={className}>
                <TabLabel name={name} />
              </Act>
            );
          })}
        </div>
        <GoTo
          to={playTo}
          cta="Play"
          disabled={!playEnabled}
          title={playEnabled ? undefined : UNAVAILABLE}
          className={buttonClass("secondary", "px-3 font-semibold")}
        >
          <Play size={10} fill="currentColor" aria-hidden />
          Play
        </GoTo>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3.5">
        {layoutMenu}
        <GoTo to="STA-WORLD-EMPTY" cta={guide} className={buttonClass("ghost", "rounded-full")}>
          {guide}
        </GoTo>
        <GoTo to="MOD-SHARE" cta="Share" className={buttonClass("secondary")}>
          Share
        </GoTo>
        <GoTo
          to={primary.to}
          cta={primary.label}
          disabled={primary.disabled}
          title={primary.disabled ? UNAVAILABLE : undefined}
          className={buttonClass("primary")}
        >
          {primary.label}
        </GoTo>
        <WindowControlsSpace side="end" />
      </div>
    </header>
  );
}

// Reserves the bold width so a tab keeps its size when it becomes active.
function TabLabel({ name }: { name: string }) {
  return (
    <span className="grid text-center">
      <span aria-hidden className="invisible col-start-1 row-start-1 font-semibold">
        {name}
      </span>
      <span className="col-start-1 row-start-1">{name}</span>
    </span>
  );
}
