// SCR-MOTION · STA-MOTION-TRAINING
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { WorkspaceShell } from "../../app/shell/workspace-shell.tsx";
import { ExplorerPanel } from "../../editor/explorer/explorer-panel.tsx";
import { InspectorPanel } from "../../editor/inspector/inspector-panel.tsx";
import { useGuide } from "../../editor/scene-queries.ts";
import { Toolbar } from "../../editor/viewport/toolbar/toolbar.tsx";
import { MOTION_TOOLS } from "../../editor/viewport/toolbar/toolbar-presets.ts";
import { guideLabel } from "../../ui/guide-label.ts";
import { CHARACTER_WORKSPACES, useOpenProjectName } from "../../ui/project-name.ts";
import { LoadingState } from "../../ui/states.tsx";
import { ChatPanel } from "../copilot/chat-panel.tsx";
import { ClipTimelinePanel } from "./clip-timeline/clip-timeline-panel.tsx";
import { MotionComparePanel } from "./compare/motion-compare-panel.tsx";
import { MOTION_VARIANTS, motionConfig } from "./motion-variants.ts";
import { TrainingStatusCard } from "./training-status-card.tsx";

// The motion workspace: the reference against the physics copy; while the copy trains, its status floats on top.
export function MotionScreen() {
  const screen = useNavigation((state) => state.screen);
  const overlay = useNavigation((state) => state.overlay);
  const variant = MOTION_VARIANTS[screen] ?? "compare";
  const config = motionConfig(variant, overlay);
  const project = useOpenProjectName("dance-copy");
  const guide = useGuide(config.scene);
  // The header's project name and guide pill change label once they load, so the screen waits for them.
  if (guide.isPending || project === null) {
    return <LoadingState label="Opening the workspace" />;
  }
  return (
    <WorkspaceShell
      header={{
        project,
        active: "Motion",
        workspaces: CHARACTER_WORKSPACES,
        activeGoesTo: "SCR-MOTION",
        guide: guideLabel(guide.data),
        playTo: "SCR-MOTION",
        primary: config.primary,
      }}
      left={
        <>
          <ExplorerPanel scene={config.scene} label="Clip" />
          <InspectorPanel scene={config.scene} />
        </>
      }
      center={
        <>
          <section className="shrink-0 overflow-hidden rounded-card border border-line bg-panel">
            <Toolbar groups={MOTION_TOOLS} selected="Retarget" overrides={config.toolOverrides} />
          </section>
          <MotionComparePanel
            clip={config.clip}
            floating={variant === "training" ? <TrainingStatusCard clip={config.clip} /> : null}
          />
          <ClipTimelinePanel clip={config.clip} />
        </>
      }
      chat={
        <ChatPanel
          conversation={config.conversation}
          placeholder="Describe the motion…"
          suggestionRoutes={config.suggestionRoutes}
        />
      }
    />
  );
}
