// SCR-TRAIN · STA-TRAIN-FAILED
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { copilotPanel, HOME } from "../../app/shell/dock/dock-layout.ts";
import { DockWorkspaceShell } from "../../app/shell/dock/dock-workspace-shell.tsx";
import { InspectorPanel } from "../../editor/inspector/inspector-panel.tsx";
import { useGuide } from "../../editor/scene-queries.ts";
import { Toolbar } from "../../editor/viewport/toolbar/toolbar.tsx";
import { TRAIN_TOOLS } from "../../editor/viewport/toolbar/toolbar-presets.ts";
import { ViewportPanel } from "../../editor/viewport/viewport-panel.tsx";
import { guideLabel } from "../../ui/guide-label.ts";
import { PlaybackBar } from "../../ui/playback-bar.tsx";
import { useProjectName } from "../../ui/project-name.ts";
import { ChatPanel } from "../copilot/chat-panel.tsx";
import { MetricsPanel } from "./metrics/metrics-panel.tsx";
import { RunFailedCard } from "./run-failed-card.tsx";
import { RunsPanel } from "./runs/runs-panel.tsx";
import { TRAIN_CONFIG, TRAIN_VARIANTS } from "./train-variants.ts";
import { useIsTraining, useLiveView, useTrainingStream } from "./use-training.ts";

const TOOL_ROUTES = { Train: "MOD-START-TRAINING", Stop: "MOD-STOP-RUN" } as const;
const VIEWS = [
  { id: "live-training", label: "Live training" },
  { id: "replay", label: "Replay" },
];

// The Train workspace: watch learning happen live; a run that stopped by itself shows why over it.
export function TrainScreen() {
  const screen = useNavigation((state) => state.screen);
  const variant = TRAIN_VARIANTS[screen] ?? "live";
  const project = useProjectName(TRAIN_CONFIG.project);
  const guide = useGuide(TRAIN_CONFIG.scene);
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
            render: () => <InspectorPanel scene={TRAIN_CONFIG.scene} panelRoutes={{ autopilot: "MOD-AUTOPILOT" }} />,
          },
          viewport: {
            title: "Viewport",
            minimumWidth: 360,
            minimumHeight: 200,
            render: () => (
              <ViewportPanel
                label="Every parallel copy training"
                tabs={VIEWS}
                toolbar={<Toolbar groups={TRAIN_TOOLS} selected="Train" overrides={TOOL_ROUTES} />}
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
  const data = view.data;
  if (!data) {
    return null;
  }
  return (
    <>
      <div className="absolute top-3 left-3 flex flex-col gap-0.5 rounded-card-sm bg-overlay px-3.25 py-2.5">
        <span className="text-meta text-fg-tertiary">{data.caption}</span>
        <span className="text-headline font-semibold">{data.checkpoint}</span>
        <span className="text-ui text-fg-secondary">{data.result}</span>
      </div>
      {data.episode ? (
        <div className="absolute inset-x-3 bottom-3 rounded-card-sm bg-overlay px-3 py-2">
          <PlaybackBar
            at={data.episode.at}
            length={data.episode.length}
            played={data.episode.played}
            marker={data.episode.failureAt}
            chip={data.speed}
          />
        </div>
      ) : null}
    </>
  );
}
