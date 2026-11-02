// SCR-TRAIN · STA-TRAIN-FAILED
import { useContext } from "react";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { useRuntimeMode } from "../../app/runtime/port.tsx";
import { copilotPanel, HOME } from "../../app/shell/dock/dock-layout.ts";
import { DockWorkspaceShell } from "../../app/shell/dock/dock-workspace-shell.tsx";
import { InspectorPanel } from "../../editor/inspector/inspector-panel.tsx";
import { useGuide } from "../../editor/scene-queries.ts";
import { Toolbar } from "../../editor/viewport/toolbar/toolbar.tsx";
import { TRAIN_TOOLS } from "../../editor/viewport/toolbar/toolbar-presets.ts";
import { ViewportPanel } from "../../editor/viewport/viewport-panel.tsx";
import { ViewportTabsContext } from "../../editor/viewport/viewport-tabs.ts";
import { guideLabel } from "../../ui/guide-label.ts";
import { PlaybackBar } from "../../ui/playback-bar.tsx";
import { useProjectKey, useProjectName } from "../../ui/project-name.ts";
import { NoProjectState } from "../../ui/states.tsx";
import { ChatPanel } from "../copilot/chat-panel.tsx";
import { MetricsPanel } from "./metrics/metrics-panel.tsx";
import { RunFailedCard } from "./run-failed-card.tsx";
import { RunsPanel } from "./runs/runs-panel.tsx";
import { TRAIN_CONFIG, TRAIN_VARIANTS } from "./train-variants.ts";
import { useIsTraining, useLiveView, useTrainingStream } from "./use-training.ts";

const TOOL_ROUTES = { Train: "MOD-START-TRAINING", Stop: "MOD-STOP-RUN" } as const;
// With nothing training, Pause and Stop have nothing to act on.
const IDLE = "No run is training right now";
const IDLE_TOOLS = { Pause: IDLE, Stop: IDLE } as const;
const VIEWS = [
  { id: "live-training", label: "Live training" },
  { id: "replay", label: "Replay" },
];

// The Train workspace: watch learning happen live; a run that stopped by itself shows why over it.
export function TrainScreen() {
  const project = useProjectName(TRAIN_CONFIG.project);
  const scene = useProjectKey(TRAIN_CONFIG.scene);
  if (project.id === null || scene === null) {
    return <NoProjectState />;
  }
  return <TrainWorkspace project={{ id: project.id, name: project.name }} scene={scene} />;
}

function TrainWorkspace({ project, scene }: { project: { id: string; name: string }; scene: string }) {
  const screen = useNavigation((state) => state.screen);
  const variant = TRAIN_VARIANTS[screen] ?? "live";
  const guide = useGuide(scene);
  const training = useIsTraining(project.id);
  const stream = useTrainingStream(project.id);
  return (
    <div className="relative h-full">
      <DockWorkspaceShell
        header={{
          project: project.name,
          active: "Train",
          activeGoesTo: "SCR-TRAIN",
          guide: guideLabel(guide.data),
          primary: training ? { label: "Stop", to: "MOD-STOP-RUN" } : { label: "Train", to: "MOD-START-TRAINING" },
        }}
        layoutKey="train"
        panels={{
          runs: { title: "Runs", home: HOME.left, render: () => <RunsPanel project={project.id} /> },
          inspector: {
            title: "Inspector",
            optionsLabel: "Inspector options",
            home: HOME.below("runs", 608),
            render: () => <InspectorPanel scene={scene} panelRoutes={{ autopilot: "MOD-AUTOPILOT" }} />,
          },
          viewport: {
            title: "Viewport",
            minimumWidth: 360,
            minimumHeight: 200,
            render: () => (
              <ViewportPanel
                label="Every parallel copy training"
                tabs={VIEWS}
                toolbar={
                  <Toolbar
                    groups={TRAIN_TOOLS}
                    selected="Train"
                    overrides={TOOL_ROUTES}
                    unavailable={training ? undefined : IDLE_TOOLS}
                  />
                }
                overlays={<LiveOverlays project={project.id} />}
                training={{ project: project.id, onReconnect: stream.reconnect }}
              />
            ),
          },
          metrics: {
            title: "Metrics",
            home: HOME.below("viewport", 210),
            render: () => <MetricsPanel project={project.id} />,
          },
          chat: copilotPanel(() => (
            <ChatPanel
              conversation={TRAIN_CONFIG.conversation}
              placeholder="Ask why, or what to try next…"
              suggestionRoutes={TRAIN_CONFIG.suggestionRoutes}
            />
          )),
        }}
      />
      {variant === "failed" ? <RunFailedCard project={project.id} /> : null}
    </div>
  );
}

function LiveOverlays({ project }: { project: string }) {
  const view = useLiveView(project);
  const tabs = useContext(ViewportTabsContext);
  // The prototype has no recorded episodes to replay, so its bar keeps the design.
  const app = useRuntimeMode() === "app";
  const data = view.data;
  if (!data) {
    return null;
  }
  const episode = data.episode;
  return (
    <>
      <div className="absolute top-3 left-3 flex flex-col gap-0.5 rounded-card-sm bg-overlay px-3.25 py-2.5">
        <span className="text-meta text-fg-tertiary">{data.caption}</span>
        <span className="text-headline font-semibold">{data.checkpoint}</span>
        <span className="text-ui text-fg-secondary">{data.result}</span>
      </div>
      {episode ? (
        <div className="absolute inset-x-3 bottom-3 rounded-card-sm bg-overlay px-3 py-2">
          <PlaybackBar
            at={episode.at}
            length={episode.length}
            played={episode.played}
            marker={episode.failureAt}
            chip={data.speed}
            onPlay={app && tabs ? () => tabs.replay(episode.step) : undefined}
            playTitle="Replay this checkpoint's recorded episode"
          />
        </div>
      ) : null}
    </>
  );
}
