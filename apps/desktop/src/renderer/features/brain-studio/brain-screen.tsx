// SCR-BRAIN · STA-BRAIN-NETWORK · STA-BRAIN-CONNECTOME
import { useState } from "react";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { useRuntimeMode } from "../../app/runtime/port.tsx";
import { copilotPanel, type DockPanels, HOME } from "../../app/shell/dock/dock-layout.ts";
import { DockWorkspaceShell } from "../../app/shell/dock/dock-workspace-shell.tsx";
import { BrainActivityPanel } from "../../editor/brain-activity/brain-activity-panel.tsx";
import { useLiveBrainStream } from "../../editor/brain-activity/use-live-brain.ts";
import { ExplorerPanel } from "../../editor/explorer/explorer-panel.tsx";
import { InspectorPanel } from "../../editor/inspector/inspector-panel.tsx";
import { useGuide } from "../../editor/scene-queries.ts";
import { Toolbar } from "../../editor/viewport/toolbar/toolbar.tsx";
import { ViewportPanel } from "../../editor/viewport/viewport-panel.tsx";
import { LIVE } from "../../ports/brain-network-views.ts";
import { guideLabel } from "../../ui/guide-label.ts";
import { useOpenProjectName, useProjectKey } from "../../ui/project-name.ts";
import { LoadingState, NoProjectState } from "../../ui/states.tsx";
import { ChatPanel } from "../copilot/chat-panel.tsx";
import { BrainShapePanel } from "./brain-shape/brain-shape-panel.tsx";
import { BRAIN_VARIANTS, type BrainConfig, type BrainVariant, brainConfig } from "./brain-variants.ts";
import { LearningPanel } from "./learning/learning-panel.tsx";
import { NetworkDiagram, useNetworkCheckpoints } from "./network-diagram.tsx";
import { ReadingsCard, useReadings } from "./readings-card.tsx";
import { SensesActionsPanel } from "./senses-actions/senses-actions-panel.tsx";

const PANEL_ROUTES = { "brain-sizes": "MOD-BRAIN-SIZES" } as const;
// Connectome brains do not exist in the app yet, so the connectome screens show the trained brain and say so.
const CONNECTOME_NOTE = "Showing the trained brain: connectome brains are not available yet";
const NETWORK_TABS = [
  { id: "network", label: "Network" },
  { id: "scene", label: "Scene" },
] as const;

// The brain workspace; the route decides whether it shows a learned brain, its network or a connectome.
export function BrainScreen() {
  const screen = useNavigation((state) => state.screen);
  const overlay = useNavigation((state) => state.overlay);
  const variant = BRAIN_VARIANTS[screen] ?? "learned";
  const sample = brainConfig(variant, overlay);
  const scene = useProjectKey(sample.scene);
  const brain = useProjectKey(sample.brain);
  if (scene === null || brain === null) {
    return <NoProjectState />;
  }
  return <BrainWorkspace variant={variant} config={{ ...sample, scene, brain }} />;
}

function BrainWorkspace({ variant, config }: Props) {
  const project = useOpenProjectName(config.project);
  const guide = useGuide(config.scene);
  // The header's project name and guide pill change label once they load, so the screen waits for them.
  if (guide.isPending || project === null) {
    return <LoadingState label="Opening the workspace" />;
  }
  return (
    <DockWorkspaceShell
      header={{
        project,
        active: "Brain",
        activeGoesTo: config.activeGoesTo,
        guide: guideLabel(guide.data),
        routes: config.routes,
        playTo: config.playTo,
        primary: config.primary,
      }}
      layoutKey="brain"
      panels={brainPanels(variant, config)}
    />
  );
}

function brainPanels(variant: BrainVariant, config: BrainConfig): DockPanels {
  const chat = copilotPanel(
    () => (
      <ChatPanel
        conversation={config.conversation}
        placeholder={config.placeholder}
        suggestionRoutes={config.suggestionRoutes}
      />
    ),
    variant === "network",
  );
  const view = {
    title: "Viewport",
    minimumWidth: 360,
    minimumHeight: 200,
    render: () => <BrainView variant={variant} config={config} />,
  };
  switch (variant) {
    case "learned":
      return {
        senses: {
          title: "Senses and actions",
          home: HOME.left,
          render: () => <SensesActionsPanel brain={config.brain} />,
        },
        inspector: {
          title: "Inspector",
          optionsLabel: "Inspector options",
          home: HOME.below("senses", 432),
          render: () => <InspectorPanel scene={config.scene} panelRoutes={PANEL_ROUTES} subject="brain" />,
        },
        viewport: view,
        learning: {
          title: "Learning",
          home: HOME.below("viewport", 168),
          render: () => <LearningPanel brain={config.brain} />,
        },
        chat,
      };
    case "network":
      return {
        shape: {
          title: "Shape",
          home: HOME.left,
          render: () => <BrainShapePanel brain={config.brain} addLayerTo={config.addLayerTo} />,
        },
        viewport: view,
        chat,
      };
    case "connectome":
      return {
        explorer: { title: "Explorer", home: HOME.left, render: () => <ExplorerPanel scene={config.scene} /> },
        inspector: {
          title: "Inspector",
          optionsLabel: "Inspector options",
          home: HOME.below("explorer", 432),
          render: () => <InspectorPanel scene={config.scene} />,
        },
        viewport: view,
        activity: {
          title: "Brain activity",
          home: HOME.below("viewport", 196),
          render: () => <ConnectomeActivity brain={config.brain} />,
        },
        chat,
      };
  }
}

type Props = { variant: BrainVariant; config: BrainConfig };

function ConnectomeActivity({ brain }: { brain: string }) {
  const app = useRuntimeMode() === "app";
  return <BrainActivityPanel brain={brain} note={app ? CONNECTOME_NOTE : undefined} />;
}

function BrainView({ variant, config }: Props) {
  const toolbar = <Toolbar groups={config.tools} selected={config.selectedTool} overrides={config.toolOverrides} />;
  const app = useRuntimeMode() === "app";
  const network = useNetworkCheckpoints(variant === "network" ? config.brain : null);
  const [checkpoint, setCheckpoint] = useState<string | null>(null);
  const readings = useReadings(config.brain, variant !== "network").data;
  // With a trained brain, the live views play it in the background; a saved checkpoint picked in the network does not.
  const live =
    variant === "network"
      ? network.checkpoints.length > 1 && (checkpoint === null || checkpoint === LIVE)
      : (readings?.rows.length ?? 0) > 0;
  useLiveBrainStream(config.brain, live);
  switch (variant) {
    case "learned":
      return (
        <ViewportPanel
          label="The body with its sensor rays, as the brain senses them"
          scene={config.scene}
          senses
          toolbar={toolbar}
          overlays={<ReadingsCard brain={config.brain} />}
        />
      );
    case "network":
      return (
        <ViewportPanel
          label="The body with its sensors wired into the network"
          tabs={NETWORK_TABS}
          viewOptions={network.checkpoints}
          onViewOption={setCheckpoint}
          activeViewOption={app ? (checkpoint ?? network.shown) : null}
          toolbar={toolbar}
          overlays={<NetworkDiagram brain={config.brain} checkpoint={checkpoint} />}
        />
      );
    case "connectome":
      return (
        <ViewportPanel
          label="The body, its brain lit where neurons fire"
          note={app ? CONNECTOME_NOTE : undefined}
          toolbar={toolbar}
          overlays={<ReadingsCard brain={config.brain} />}
        />
      );
  }
}
