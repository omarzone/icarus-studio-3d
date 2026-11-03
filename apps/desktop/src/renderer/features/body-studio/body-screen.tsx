// SCR-BODY · STA-BODY-CHECK-FAILED
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { useRuntimeMode } from "../../app/runtime/port.tsx";
import { copilotPanel, type DockPanels, HOME } from "../../app/shell/dock/dock-layout.ts";
import { DockWorkspaceShell } from "../../app/shell/dock/dock-workspace-shell.tsx";
import { ExplorerPanel } from "../../editor/explorer/explorer-panel.tsx";
import { InspectorPanel } from "../../editor/inspector/inspector-panel.tsx";
import { useGuide } from "../../editor/scene-queries.ts";
import { Toolbar } from "../../editor/viewport/toolbar/toolbar.tsx";
import { ViewportPanel } from "../../editor/viewport/viewport-panel.tsx";
import { guideLabel } from "../../ui/guide-label.ts";
import { CHARACTER_WORKSPACES, useOpenProjectName, useProjectKey } from "../../ui/project-name.ts";
import { LoadingState, NoProjectState } from "../../ui/states.tsx";
import { ChatPanel } from "../copilot/chat-panel.tsx";
import { BODY_VARIANTS, type BodyConfig, type BodyVariant, bodyConfig } from "./body-variants.ts";
import { CheckFailedBanner } from "./check-failed-banner.tsx";
import { PosePreviewOverlay } from "./pose-preview.tsx";
import { RigCheckPanel } from "./rig-check/rig-check-panel.tsx";

// The bone inspector is taller than its panel; it scrolls without a gutter, as in the design.
const INSPECTOR_CLASS = "flex-[1.1] [&>div:last-child]:[scrollbar-width:none]";

const RIG_TABS = [
  { id: "rig", label: "Rig" },
  { id: "mesh", label: "Mesh" },
] as const;

// The body workspace; the route decides whether the physics checks pass or block training.
export function BodyScreen() {
  const screen = useNavigation((state) => state.screen);
  const overlay = useNavigation((state) => state.overlay);
  const variant = BODY_VARIANTS[screen] ?? "rig";
  const sample = bodyConfig(variant, overlay);
  const scene = useProjectKey(sample.scene);
  const body = useProjectKey(sample.body);
  if (scene === null || body === null) {
    return <NoProjectState />;
  }
  return <BodyWorkspace variant={variant} config={{ ...sample, scene, body }} />;
}

function BodyWorkspace({ variant, config }: { variant: BodyVariant; config: BodyConfig }) {
  const project = useOpenProjectName("dance-copy");
  const guide = useGuide(config.scene);
  // The sample's Play shows its motion clip; in the app Play plays the project.
  const app = useRuntimeMode() === "app";
  // The header's project name and guide pill change label once they load, so the screen waits for them.
  if (guide.isPending || project === null) {
    return <LoadingState label="Opening the workspace" />;
  }
  const toolbar = <Toolbar groups={config.tools} selected={config.selectedTool} overrides={config.toolOverrides} />;
  return (
    <DockWorkspaceShell
      header={{
        project,
        active: "Body",
        workspaces: CHARACTER_WORKSPACES,
        activeGoesTo: "SCR-BODY",
        guide: guideLabel(guide.data),
        playTo: app ? undefined : "SCR-MOTION",
        primary: { label: "Train", to: "MOD-START-TRAINING" },
      }}
      layoutKey="body"
      panels={{
        explorer: {
          title: config.explorerLabel ?? "Explorer",
          home: HOME.left,
          render: () => <ExplorerPanel scene={config.scene} label={config.explorerLabel} />,
        },
        inspector: {
          title: "Inspector",
          optionsLabel: "Inspector options",
          home: HOME.below("explorer", 432),
          render: () => (
            <InspectorPanel
              scene={config.scene}
              addComponentTo={config.rigged ? "POP-ADD-COMPONENT" : undefined}
              className={INSPECTOR_CLASS}
            />
          ),
        },
        viewport: {
          title: "Viewport",
          minimumWidth: 360,
          minimumHeight: 200,
          render: () =>
            config.rigged ? (
              <ViewportPanel
                label="The body seen through, with its bones, joints and colliders"
                tabs={RIG_TABS}
                scene={config.scene}
                toolbar={toolbar}
                overlays={
                  <>
                    <PosePreviewOverlay body={config.body} />
                    {variant === "check-failed" ? <CheckFailedBanner body={config.body} /> : null}
                  </>
                }
              />
            ) : (
              <ViewportPanel label="The project's world before a body is imported" toolbar={toolbar} />
            ),
        },
        ...((config.rigged
          ? {
              checks: {
                title: "Checks",
                home: HOME.below("viewport", 168),
                render: () => <RigCheckPanel body={config.body} />,
              },
            }
          : {}) satisfies DockPanels),
        chat: copilotPanel(() => (
          <ChatPanel
            conversation={config.conversation}
            placeholder={config.placeholder}
            suggestionRoutes={config.suggestionRoutes}
          />
        )),
      }}
    />
  );
}
