// SCR-BUILD · STA-BUILD-HARDWARE
import type { ScreenId } from "../../app/navigation/catalog-id.ts";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { copilotPanel, HOME } from "../../app/shell/dock/dock-layout.ts";
import { DockWorkspaceShell } from "../../app/shell/dock/dock-workspace-shell.tsx";
import { ChatPanel } from "../copilot/chat-panel.tsx";
import type { SuggestionRoutes } from "../copilot/suggestion-chips.tsx";
import { HardwarePage } from "./hardware/hardware-page.tsx";
import { BuildTargetViewPanel } from "./target-view/build-target-view-panel.tsx";
import { BuildTargetsPanel } from "./targets/build-targets-panel.tsx";
import { useBuildProject, useUnderOverlay } from "./use-build-project.ts";

type BuildVariant = "community" | "hardware";

const BUILD_VARIANTS: Readonly<Partial<Record<ScreenId, BuildVariant>>> = {
  "SCR-BUILD": "community",
  "STA-BUILD-HARDWARE": "hardware",
};

// The Build workspace; the route decides whether it shows the build targets or the real hardware flow.
export function BuildScreen() {
  const screen = useNavigation((state) => state.screen);
  const variant = BUILD_VARIANTS[screen] ?? "community";
  const underOverlay = useUnderOverlay();
  const project = useBuildProject();
  const header = {
    project: project.name,
    active: "Build" as const,
    activeGoesTo: variant === "community" && !underOverlay ? undefined : ("SCR-BUILD" as const),
    // The getting-started guide lives in World; Build only offers to reopen it.
    guide: "Guide",
    primary: { label: "Publish", to: "MOD-PUBLISH" as const },
  };
  switch (variant) {
    case "community":
      return (
        <DockWorkspaceShell
          header={header}
          layoutKey="build"
          panels={{
            targets: {
              title: "Build",
              home: HOME.left,
              render: () => (
                <BuildTargetsPanel
                  project={project.id}
                  selected="community"
                  routes={{
                    community: underOverlay ? "SCR-BUILD" : undefined,
                    "export-brain": "MOD-EXPORT-BRAIN",
                    hardware: "STA-BUILD-HARDWARE",
                    game: "MOD-EXPORT-BRAIN",
                    animation: "MOD-EXPORT-ANIMATION",
                  }}
                />
              ),
            },
            view: {
              title: "Share to community",
              minimumWidth: 360,
              render: () => (
                <BuildTargetViewPanel project={project.id} projectName={project.name} underOverlay={underOverlay} />
              ),
            },
            chat: copilotPanel(() => (
              <ChatPanel
                conversation="park-pilot-build"
                placeholder="Ask about sharing or building…"
                suggestionRoutes={communityChips(underOverlay)}
              />
            )),
          }}
        />
      );
    case "hardware":
      return (
        <DockWorkspaceShell
          header={header}
          layoutKey="build-hardware"
          panels={{
            hardware: {
              title: "Hardware",
              bare: true,
              minimumWidth: 480,
              render: () => <HardwarePage project={project.id} projectName={project.name} />,
            },
            chat: copilotPanel(() => (
              <ChatPanel conversation="park-pilot-hardware" placeholder="Ask about the hardware…" />
            )),
          }}
        />
      );
  }
}

function communityChips(underOverlay: boolean): SuggestionRoutes {
  const routes: SuggestionRoutes = { "export-brain": "MOD-EXPORT-BRAIN", "order-parts": "STA-BUILD-HARDWARE" };
  return underOverlay ? { ...routes, "propose-change": "SCR-BUILD" } : routes;
}
