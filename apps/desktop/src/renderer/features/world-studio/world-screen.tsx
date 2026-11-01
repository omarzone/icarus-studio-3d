// SCR-WORLD · STA-WORLD-EMPTY · STA-WORLD-EMPTY-NOGUIDE · STA-WORLD-BUILDING · STA-WORLD-PROPOSAL
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { GoTo } from "../../app/navigation/go-to.tsx";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { copilotPanel, HOME } from "../../app/shell/dock/dock-layout.ts";
import { DockWorkspaceShell } from "../../app/shell/dock/dock-workspace-shell.tsx";
import { ExplorerPanel } from "../../editor/explorer/explorer-panel.tsx";
import { InspectorPanel } from "../../editor/inspector/inspector-panel.tsx";
import { useGuide } from "../../editor/scene-queries.ts";
import { Toolbar } from "../../editor/viewport/toolbar/toolbar.tsx";
import {
  ActivityPill,
  OverlayBottomLeft,
  OverlayBottomRight,
  OverlayTop,
  PreviewPill,
} from "../../editor/viewport/viewport-overlays.tsx";
import { ViewportPanel } from "../../editor/viewport/viewport-panel.tsx";
import { copilotPort } from "../../ports/copilot-port.ts";
import { useBuildProgress } from "../copilot/build-progress-card.tsx";
import { ChatPanel, copilotKey } from "../copilot/chat-panel.tsx";
import { GuideCard, guideLabel, ShowGuidePill } from "./guide-card.tsx";
import { LibraryPanel } from "./library/library-panel.tsx";
import { useProjectName } from "./use-project-name.ts";
import { useWorldScene } from "./use-world-scene.ts";
import { WORLD_CONFIGS, WORLD_VARIANTS, type WorldConfig, type WorldVariant } from "./world-variants.ts";

const PANEL_ROUTES = { "training-copies": "POP-TRAINING-COPIES" } as const;

// The World workspace; the route decides which state it shows (new project, building, proposal…).
export function WorldScreen() {
  const screen = useNavigation((state) => state.screen);
  const variant = WORLD_VARIANTS[screen] ?? "world";
  const config = WORLD_CONFIGS[variant];
  const scene = useWorldScene(config.scene);
  // The app shows nothing until a project opened from a template exists.
  return scene === null ? null : <WorldWorkspace variant={variant} config={config} scene={scene} />;
}

function WorldWorkspace({ variant, config, scene }: { variant: WorldVariant; config: WorldConfig; scene: string }) {
  const project = useProjectName(config.hasProject || scene !== config.scene);
  const guide = useGuide(scene);
  const go = useNavigation((state) => state.go);
  return (
    <DockWorkspaceShell
      header={{
        project,
        active: "World",
        activeGoesTo: config.activeGoesTo,
        guide: guideLabel(guide.data),
        playEnabled: config.playEnabled,
        primary: { label: "Train", to: "MOD-START-TRAINING", disabled: !config.trainEnabled },
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
              toolbar={<Toolbar groups={config.tools} selected={config.selectedTool} />}
              tint={variant === "proposal" ? "proposal" : undefined}
              overlays={<WorldOverlays variant={variant} config={config} scene={scene} />}
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
      return null;
    case "empty":
    case "empty-noguide":
      return <GuideOverlay scene={scene} hidden={variant === "empty-noguide"} />;
    case "building":
      return <BuildingOverlay scene={scene} />;
    case "proposal":
      return <ProposalOverlay conversation={config.conversation} />;
  }
}

function GuideOverlay({ scene, hidden }: { scene: string; hidden: boolean }) {
  const guide = useGuide(scene);
  if (!guide.data) {
    return null;
  }
  return (
    <OverlayBottomLeft>
      {hidden ? <ShowGuidePill guide={guide.data} /> : <GuideCard guide={guide.data} />}
    </OverlayBottomLeft>
  );
}

function BuildingOverlay({ scene }: { scene: string }) {
  const build = useBuildProgress(scene);
  return (
    <>
      {build.data ? (
        <OverlayTop>
          <ActivityPill text={build.data.activity} />
        </OverlayTop>
      ) : null}
      <OverlayBottomRight>
        <GoTo
          to="SCR-WORLD"
          cta="Open when ready"
          title="Opens the world as soon as the build finishes"
          className="flex h-8.5 items-center gap-2 rounded-button bg-selected px-3.5 text-body font-semibold text-on-selected hover:opacity-90"
        >
          Open when ready
          <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
        </GoTo>
      </OverlayBottomRight>
    </>
  );
}

function ProposalOverlay({ conversation }: { conversation: string }) {
  const port = usePort(copilotPort);
  const chat = useQuery({ queryKey: copilotKey(conversation), queryFn: () => port.getConversation(conversation) });
  const open = chat.data?.messages.find((message) => message.role === "proposal" && message.proposal.status === "open");
  if (open?.role !== "proposal") {
    return null;
  }
  const revision = open.proposal.revision;
  return (
    <OverlayTop>
      <PreviewPill
        text={revision ? `Preview of revision ${revision} · not applied yet` : "Preview · not applied yet"}
      />
    </OverlayTop>
  );
}
