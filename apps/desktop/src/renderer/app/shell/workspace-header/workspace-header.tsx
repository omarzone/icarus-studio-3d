// HDR-WORKSPACE
import { tokens } from "@icarus/ui-tokens";
import { ChevronDown, Play } from "lucide-react";
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
  primary: { label: string; to: RouteId; disabled?: boolean };
};

export function WorkspaceHeader({
  project,
  active,
  workspaces = DEFAULT_WORKSPACES,
  activeGoesTo,
  guide,
  playEnabled = true,
  primary,
}: WorkspaceHeaderProps) {
  useTitleBarHeight(tokens.size.headerWorkspace);
  return (
    <header data-ui-id="HDR-WORKSPACE" className="title-bar col-span-full flex h-13 items-center gap-3.5 pr-3.5 pl-4.5">
      <WindowControlsSpace side="start" />
      <GoTo
        to="POP-PROJECT-MENU"
        cta={project}
        className="flex h-8 items-center gap-2 rounded-button px-2 text-[14px] font-semibold hover:bg-fill-hover active:opacity-80"
      >
        {project}
        <ChevronDown size={12} strokeWidth={1.75} className="text-fg-tertiary" aria-hidden />
      </GoTo>
      <div className="mx-auto flex items-center gap-2">
        <div className="flex gap-0.5 rounded-button bg-control p-[3px]">
          {workspaces.map((name) => {
            const isActive = name === active;
            const className = isActive
              ? "rounded-control bg-selected px-3.5 py-1.5 text-ui font-semibold text-on-selected"
              : "rounded-control px-3.5 py-1.5 text-ui text-fg-tertiary hover:bg-fill-hover hover:text-fg active:opacity-80";
            const to = isActive ? activeGoesTo : WORKSPACE_ROUTES[name];
            return to ? (
              <GoTo key={name} to={to} cta={name} aria-current={isActive ? "page" : undefined} className={className}>
                {name}
              </GoTo>
            ) : (
              <Act key={name} cta={name} aria-current="page" className={className}>
                {name}
              </Act>
            );
          })}
        </div>
        <GoTo
          to="SCR-PLAY"
          cta="Play"
          disabled={!playEnabled}
          title={playEnabled ? undefined : UNAVAILABLE}
          className={buttonClass("secondary", "px-3 font-semibold")}
        >
          <Play size={10} fill="currentColor" aria-hidden />
          Play
        </GoTo>
      </div>
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
    </header>
  );
}
