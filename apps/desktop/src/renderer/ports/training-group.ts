import type { RunStatus, SceneDescription } from "@icarus/contracts";
import type { OpenRunEvents, RunEventsConnection } from "../engine-client/run-events.ts";
import { createMotionPlayer, type MotionPlayer } from "../scene/motion-player.ts";
import { compactNumber } from "../ui/compact-number.ts";
import { agentScores, joinedPlayer, joinPoses, joinScenes, joinSignals } from "./agent-lanes.ts";
import { liveProgress } from "./live-progress.ts";
import { snapshotCopies, snapshotMotion, snapshotRays, snapshotSignals } from "./replay-views.ts";
import type { CopyPoses, LiveCopies, TrainingChange } from "./training-port.ts";
import { isFinal } from "./training-views.ts";

type Lane = {
  status: RunStatus;
  player?: MotionPlayer;
  poses?: CopyPoses;
  rays: ReturnType<typeof snapshotRays>[number];
  signals: ReturnType<typeof snapshotSignals>[number];
  step: number;
};

export type GroupWatch = {
  runs: readonly RunStatus[];
  open: OpenRunEvents;
  runScene: (runId: string) => Promise<SceneDescription>;
  show: (live: LiveCopies) => void;
  onChange: (changes: readonly TrainingChange[]) => void;
  onFailed: () => void;
};

// Streams every agent's run of a group into one live scene: each agent in its lane with its first copy's real
// recorded motion, and a line per agent on the scoreboard. Returns the function that disconnects them all.
export function watchGroup({ runs, open, runScene, show, onChange, onFailed }: GroupWatch): () => void {
  const lanes: Lane[] = runs.map((status) => ({ status, rays: [], signals: null, step: 0 }));
  const endedEarlier = runs.every(isFinal);
  let live = false;
  let scene: Promise<SceneDescription | null> | null = null;
  const joined = () => {
    scene ??= Promise.all(runs.map((run) => runScene(run.run_id))).then(joinScenes);
    return scene;
  };
  const player = joinedPlayer(() => lanes.map((lane) => lane.player));
  const lead = () => lanes[0]?.status;
  const render = () => {
    void joined().then(
      (description) => {
        const first = lead();
        if (!description || !first) {
          return;
        }
        live = true;
        const ended = lanes.every((lane) => isFinal(lane.status));
        show({
          kind: "live",
          scene: description,
          step: `${compactNumber(Math.min(...lanes.map((lane) => lane.step)))} steps`,
          copies: [joinPoses(lanes.map((lane) => lane.poses))],
          rays: [lanes.flatMap((lane) => lane.rays)],
          signals: [joinSignals(lanes.map((lane) => lane.signals))],
          player: lanes.some((lane) => lane.player) ? player : undefined,
          progress: ended ? undefined : liveProgress(first, lanes[0]?.step ?? 0, performance.now()),
          agents: agentScores(lanes.map((lane) => lane.status)),
          note: ended ? `${lanes.length} agents ended · Open Replay to watch any of their checkpoints.` : undefined,
        });
      },
      (error: unknown) => show({ kind: "closed", reason: error instanceof Error ? error.message : String(error) }),
    );
  };
  show(
    endedEarlier
      ? {
          kind: "message",
          title: `${runs.length} agents ended`,
          body: "Open Replay to watch any of their checkpoints.",
        }
      : {
          kind: "message",
          title: `${runs.length} agents are starting`,
          body: "Each agent appears in its lane once it runs.",
          starting: true,
        },
  );
  const connections: RunEventsConnection[] = lanes.map((lane) =>
    open(lane.status.run_id, {
      onStatus: (next) => {
        const failedNow = next.state === "failed" && !isFinal(lane.status);
        lane.status = next;
        onChange(isFinal(next) ? ["runs", "live-view", "metrics", "checkpoints"] : ["runs", "live-view"]);
        if (live) {
          render();
        }
        if (failedNow && !endedEarlier) {
          onFailed();
        }
      },
      onMetric: () => onChange(["metrics"]),
      onCheckpoint: () => onChange(["checkpoints", "live-view"]),
      onSnapshot: (snapshot) => {
        lane.step = snapshot.step;
        lane.poses = snapshotCopies(snapshot)[0];
        lane.rays = snapshotRays(snapshot)[0] ?? [];
        lane.signals = snapshotSignals(snapshot)[0] ?? null;
        const motion = snapshotMotion(snapshot);
        if (motion) {
          const mode = snapshot.live_view === "fast" ? "fast" : "realtime";
          lane.player = lane.player?.mode === mode ? lane.player : createMotionPlayer(mode);
          lane.player.push(motion.slice(0, 1), performance.now());
        }
        render();
      },
      onLog: () => onChange(["console"]),
      onError: () => undefined,
      onEnd: () => undefined,
      onClosed: (reason) => show({ kind: "closed", reason }),
    }),
  );
  return () => {
    for (const connection of connections) {
      connection.close();
    }
  };
}
