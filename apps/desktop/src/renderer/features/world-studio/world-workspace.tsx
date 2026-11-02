// The World workspace's docked panels, shared by every state of the screen.
import type { ReactNode } from "react";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { useRuntimeMode } from "../../app/runtime/port.tsx";
import { copilotPanel, HOME } from "../../app/shell/dock/dock-layout.ts";
import { DockWorkspaceShell } from "../../app/shell/dock/dock-workspace-shell.tsx";
import { ExplorerPanel } from "../../editor/explorer/explorer-panel.tsx";
import { InspectorPanel } from "../../editor/inspector/inspector-panel.tsx";
import { useGuide } from "../../editor/scene-queries.ts";
import { useGizmoTools } from "../../editor/viewport/toolbar/gizmo-tools.ts";
import { Toolbar } from "../../editor/viewport/toolbar/toolbar.tsx";
import { GIZMO_TOOLS } from "../../editor/viewport/toolbar/toolbar-presets.ts";
import { OverlayBottomLeft, OverlayTop, PreviewPill } from "../../editor/viewport/viewport-overlays.tsx";
import { ViewportPanel } from "../../editor/viewport/viewport-panel.tsx";
import { ChatPanel } from "../copilot/chat-panel.tsx";
import { useConversationKey, useProposalPreview } from "../copilot/conversation-key.ts";
import { useCopiesPreview } from "./copies-preview-store.ts";
import { GuideCard, guideLabel, ShowGuidePill } from "./guide-card.tsx";
import { LibraryPanel } from "./library/library-panel.tsx";
import { useProjectName } from "./use-project-name.ts";
import { useWorldToolActions } from "./world-tool-actions.ts";
import type { WorldConfig, WorldVariant } from "./world-variants.ts";

const PANEL_ROUTES = { "training-copies": "POP-TRAINING-COPIES" } as const;

export function WorldWorkspace({
  variant,
  config,
  scene,
  overlays,
}: {
  variant: WorldVariant;
  config: WorldConfig;
  scene: string;
  // Drawn over the viewport instead of the variant's own overlays.
  overlays?: ReactNode;
}) {
  const project = useProjectName(config.hasProject || scene !== config.scene);
  const guide = useGuide(scene);
  const go = useNavigation((state) => state.go);
  const preview = useProposalPreview(useConversationKey(config.conversation));
  const previewing = variant === "proposal" || Boolean(preview.data);
  const copiesScene = useCopiesPreview((state) => state.scene);
  const hideCopies = useCopiesPreview((state) => state.hide);
  const copiesPreview = copiesScene === scene ? { onExit: hideCopies } : undefined;
  const toolActions = useWorldToolActions(scene);
  // In the app the project exists in every editable state (the empty states only show the guide over it).
  const appProject = useRuntimeMode() === "app" && variant !== "building";
  // Move, Rotate and Scale lead the tools wherever the app has a scene to drag in; the designs keep their tools.
  const gizmo = useGizmoTools();
  const toolbar = appProject ? (
    <Toolbar
      groups={[GIZMO_TOOLS, ...config.tools]}
      active={gizmo.active}
      actions={{ ...toolActions, ...gizmo.actions }}
    />
  ) : (
    <Toolbar groups={config.tools} selected={config.selectedTool} actions={toolActions} />
  );
  return (
    <DockWorkspaceShell
      header={{
        project,
        active: "World",
        activeGoesTo: config.activeGoesTo,
        guide: guideLabel(guide.data),
        playEnabled: config.playEnabled || appProject,
        primary: { label: "Train", to: "MOD-START-TRAINING", disabled: !(config.trainEnabled || appProject) },
      }}
      layoutKey="world"
      panels={{
        explorer: {
          title: "Explorer",
          home: HOME.left,
          render: () => <ExplorerPanel scene={scene} onAction={() => go("SCR-IDEAS")} />,
        },
        inspector: {
          title: "Inspector",
          home: HOME.below("explorer", 392),
          optionsLabel: "Inspector options",
          render: () => <InspectorPanel scene={scene} addComponentTo="POP-ADD-COMPONENT" panelRoutes={PANEL_ROUTES} />,
        },
        viewport: {
          title: "Viewport",
          minimumWidth: 360,
          minimumHeight: 200,
          render: () => (
            <ViewportPanel
              label="The project's world"
              scene={scene}
              toolbar={toolbar}
              tint={previewing ? "proposal" : undefined}
              ghosts={preview.data?.geoms}
              copiesPreview={copiesPreview}
              overlays={overlays ?? <WorldOverlays variant={variant} config={config} scene={scene} />}
            />
          ),
        },
        ...(config.importLabel
          ? {
              library: {
                title: "Library",
                home: HOME.below("viewport", 168),
                minimumHeight: 120,
                render: () => <LibraryPanel scene={scene} importLabel={config.importLabel ?? ""} />,
              },
            }
          : {}),
        chat: copilotPanel(() => (
          <ChatPanel
            conversation={config.conversation}
            placeholder={config.placeholder}
            suggestionRoutes={config.suggestionRoutes}
            proposalRoutes={config.proposalRoutes}
          />
        )),
      }}
    />
  );
}

function WorldOverlays({ variant, config, scene }: { variant: WorldVariant; config: WorldConfig; scene: string }) {
  switch (variant) {
    case "world":
    case "proposal":
      return <ProposalOverlay conversation={config.conversation} />;
    case "empty":
    case "empty-noguide":
      return <GuideOverlay scene={scene} hidden={variant === "empty-noguide"} />;
    case "building":
      return null;
  }
}

function GuideOverlay({ scene, hidden }: { scene: string; hidden: boolean }) {
  const guide = useGuide(scene);
  if (!guide.data) {
    return null;
  }
  return (
    <OverlayBottomLeft>
      {hidden ? <ShowGuidePill guide={guide.data} /> : <GuideCard guide={guide.data} project={scene} />}
    </OverlayBottomLeft>
  );
}

// The open proposal is a preview until it is applied: the viewport says so above the blue changes.
function ProposalOverlay({ conversation }: { conversation: string }) {
  const preview = useProposalPreview(useConversationKey(conversation));
  if (!preview.data) {
    return null;
  }
  const revision = preview.data.revision;
  return (
    <OverlayTop>
      <PreviewPill
        text={revision ? `Preview of revision ${revision} · not applied yet` : "Preview · not applied yet"}
      />
    </OverlayTop>
  );
}
