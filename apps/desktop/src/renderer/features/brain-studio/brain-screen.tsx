// SCR-BRAIN · STA-BRAIN-NETWORK · STA-BRAIN-CONNECTOME
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { WorkspaceShell } from "../../app/shell/workspace-shell.tsx";
import { ExplorerPanel } from "../../editor/explorer/explorer-panel.tsx";
import { InspectorPanel } from "../../editor/inspector/inspector-panel.tsx";
import { useGuide } from "../../editor/scene-queries.ts";
import { Toolbar } from "../../editor/viewport/toolbar/toolbar.tsx";
import { ViewportPanel } from "../../editor/viewport/viewport-panel.tsx";
import { guideLabel } from "../../ui/guide-label.ts";
import { useOpenProjectName } from "../../ui/project-name.ts";
import { LoadingState } from "../../ui/states.tsx";
import { ChatPanel } from "../copilot/chat-panel.tsx";
import { BrainActivityPanel } from "./brain-activity/brain-activity-panel.tsx";
import { BrainShapePanel } from "./brain-shape/brain-shape-panel.tsx";
import { BRAIN_VARIANTS, type BrainConfig, type BrainVariant, brainConfig } from "./brain-variants.ts";
import { LearningPanel } from "./learning/learning-panel.tsx";
import { NetworkDiagram, useNetworkCheckpoints } from "./network-diagram.tsx";
import { ReadingsCard } from "./readings-card.tsx";
import { SensesActionsPanel } from "./senses-actions/senses-actions-panel.tsx";

const PANEL_ROUTES = { "brain-sizes": "MOD-BRAIN-SIZES" } as const;
const NETWORK_TABS = [
  { id: "network", label: "Network" },
  { id: "scene", label: "Scene" },
] as const;

// The brain workspace; the route decides whether it shows a learned brain, its network or a connectome.
export function BrainScreen() {
  const screen = useNavigation((state) => state.screen);
  const overlay = useNavigation((state) => state.overlay);
  const variant = BRAIN_VARIANTS[screen] ?? "learned";
  const config = brainConfig(variant, overlay);
  const project = useOpenProjectName(config.project);
  const guide = useGuide(config.scene);
  // The header's project name and guide pill change label once they load, so the screen waits for them.
  if (guide.isPending || project === null) {
    return <LoadingState label="Opening the workspace" />;
  }
  return (
    <WorkspaceShell
      header={{
        project,
        active: "Brain",
        activeGoesTo: config.activeGoesTo,
        guide: guideLabel(guide.data),
        routes: config.routes,
        playTo: config.playTo,
        primary: config.primary,
      }}
      narrowChat={variant === "network"}
      left={<BrainLeft variant={variant} config={config} />}
      center={<BrainCenter variant={variant} config={config} />}
      chat={
        <ChatPanel
          conversation={config.conversation}
          placeholder={config.placeholder}
          suggestionRoutes={config.suggestionRoutes}
        />
      }
    />
  );
}

type Props = { variant: BrainVariant; config: BrainConfig };

function BrainLeft({ variant, config }: Props) {
  switch (variant) {
    case "learned":
      return (
        <>
          <SensesActionsPanel brain={config.brain} />
          <InspectorPanel scene={config.scene} panelRoutes={PANEL_ROUTES} />
        </>
      );
    case "network":
      return <BrainShapePanel brain={config.brain} addLayerTo={config.addLayerTo} />;
    case "connectome":
      return (
        <>
          <ExplorerPanel scene={config.scene} />
          <InspectorPanel scene={config.scene} />
        </>
      );
  }
}

function BrainCenter({ variant, config }: Props) {
  const toolbar = <Toolbar groups={config.tools} selected={config.selectedTool} overrides={config.toolOverrides} />;
  const checkpoints = useNetworkCheckpoints(variant === "network" ? config.brain : null);
  switch (variant) {
    case "learned":
      return (
        <>
          <ViewportPanel
            label="The body with its sensor rays, as the brain senses them"
            toolbar={toolbar}
            overlays={<ReadingsCard brain={config.brain} />}
          />
          <LearningPanel brain={config.brain} />
        </>
      );
    case "network":
      return (
        <ViewportPanel
          label="The body with its sensors wired into the network"
          tabs={NETWORK_TABS}
          viewOptions={checkpoints}
          toolbar={toolbar}
          overlays={<NetworkDiagram brain={config.brain} />}
        />
      );
    case "connectome":
      return (
        <>
          <ViewportPanel
            label="The body, its brain lit where neurons fire"
            toolbar={toolbar}
            overlays={<ReadingsCard brain={config.brain} />}
          />
          <BrainActivityPanel brain={config.brain} />
        </>
      );
  }
}
