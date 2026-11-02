import type { LogLine, RunStatus, SceneDescription } from "@icarus/contracts";
import { type EngineApi, engineApi } from "../engine-client/engine-api.ts";
import { type OpenRunEvents, openRunEvents, type RunEventsConnection } from "../engine-client/run-events.ts";
import { compactNumber } from "../ui/compact-number.ts";
import { checkpointMarks, replayFrames, snapshotCopies } from "./replay-views.ts";
import { liveMetrics } from "./training-metrics.ts";
import type { LiveCopies, RunList, TrainingPort } from "./training-port.ts";
import {
  activeRun,
  consoleLines,
  failureView,
  isFinal,
  liveView,
  type PlanChoice,
  runList,
  startPlan,
  startRequest,
  stopSummary,
} from "./training-views.ts";

// Training on the engine: runs, metrics and checkpoints over HTTP, the selected run streamed over its events.

type TrainingApi = Pick<
  EngineApi,
  | "runs"
  | "startRun"
  | "stopRun"
  | "metrics"
  | "checkpoints"
  | "rollout"
  | "project"
  | "library"
  | "runScene"
  | "trainingSettings"
>;

export type EngineTrainingPort = Omit<
  TrainingPort,
  "pauseRun" | "getAutopilot" | "setAutopilot" | "startAutopilot" | "stopAutopilot"
>;

const MAX_LOG_LINES = 500;

export function createEngineTrainingPort(
  api: TrainingApi = engineApi,
  open: OpenRunEvents = openRunEvents,
): EngineTrainingPort {
  const selected = new Map<string, string>();
  const choices = new Map<string, PlanChoice>();
  const logs = new Map<string, LogLine[]>();
  const scenes = new Map<string, Promise<SceneDescription>>();
  let labels: Promise<Map<string, string>> | null = null;

  // A run trains in its frozen revision, so its episodes are drawn in that scene, not the edited project.
  const runScene = (runId: string) => {
    let scene = scenes.get(runId);
    if (!scene) {
      scene = api.runScene(runId);
      scenes.set(runId, scene);
      scene.catch(() => scenes.delete(runId));
    }
    return scene;
  };

  const termLabels = () => {
    labels ??= api.library().then(
      (catalog) => new Map(catalog.reward_terms.map((term) => [term.term, term.label])),
      (error: unknown) => {
        labels = null;
        throw error;
      },
    );
    return labels;
  };
  const selectedRun = async (project: string): Promise<{ runs: RunStatus[]; run: RunStatus | undefined }> => {
    const runs = await api.runs(project);
    return { runs, run: runs.find((item) => item.run_id === selected.get(project)) ?? runs[0] };
  };
  const listRuns = async (project: string): Promise<RunList> => runList(await api.runs(project), selected.get(project));
  const requireRun = async (project: string): Promise<RunStatus> => {
    const { run } = await selectedRun(project);
    if (!run) {
      throw new Error("This project has no training run yet");
    }
    return run;
  };
  const requireActive = async (project: string): Promise<RunStatus> => {
    const run = activeRun(await api.runs(project));
    if (!run) {
      throw new Error("No run is training right now");
    }
    return run;
  };
  const getStartPlan = async (project: string) => {
    const [runs, state, settings] = await Promise.all([
      api.runs(project),
      api.project(project),
      api.trainingSettings(),
    ]);
    const choice = choices.get(project) ?? {};
    return startPlan({ runs: runs.length, family: state.project.task.family, settings, choice });
  };

  return {
    listRuns,
    selectRun: async ({ project, id }) => {
      selected.set(project, id);
      return listRuns(project);
    },
    getLiveView: async (project) => {
      const run = await requireRun(project);
      return liveView(run, await api.checkpoints(run.run_id));
    },
    getMetrics: async (project) => {
      const { run } = await selectedRun(project);
      if (!run) {
        return { progress: "", series: [], breakdown: { title: "Reward breakdown", terms: [] } };
      }
      const [points, names] = await Promise.all([api.metrics(run.run_id), termLabels()]);
      return liveMetrics(run, points, names);
    },
    getConsole: async (project) => {
      const { run } = await selectedRun(project);
      return run ? consoleLines(logs.get(run.run_id) ?? []) : [];
    },
    getStartPlan,
    updateStartPlan: async ({ project, steps, copies, coach }) => {
      const previous = choices.get(project) ?? {};
      choices.set(project, {
        steps: steps ?? previous.steps,
        copies: copies ?? previous.copies,
        coach: coach ?? previous.coach,
      });
      return getStartPlan(project);
    },
    startRun: async (project) => {
      const started = await api.startRun(project, startRequest(await getStartPlan(project)));
      selected.set(project, started.run_id);
      return listRuns(project);
    },
    getStopSummary: async (project) => {
      const run = await requireActive(project);
      return stopSummary(run, await api.checkpoints(run.run_id));
    },
    stopRun: async (project) => {
      const run = await requireActive(project);
      await api.stopRun(run.run_id);
      return listRuns(project);
    },
    getFailure: async (project) => {
      const { runs, run } = await selectedRun(project);
      const failed = run?.state === "failed" ? run : runs.find((item) => item.state === "failed");
      if (!failed) {
        throw new Error("No run of this project stopped by itself");
      }
      return failureView(failed, runs);
    },
    getCheckpoints: async (project) => {
      const { run } = await selectedRun(project);
      return run ? checkpointMarks(run, await api.checkpoints(run.run_id)) : [];
    },
    getReplay: async ({ project, step }) => {
      const run = await requireRun(project);
      const [rollout, scene] = await Promise.all([api.rollout(run.run_id, step), runScene(run.run_id)]);
      const first = rollout.frames[0]?.time ?? 0;
      return {
        scene,
        label: `Checkpoint ${compactNumber(step)}`,
        outcome: rollout.outcome,
        duration: Math.max(0, (rollout.frames.at(-1)?.time ?? first) - first),
        frames: replayFrames(rollout),
      };
    },
    watch: (project, listener) => {
      let connection: RunEventsConnection | null = null;
      let cancelled = false;
      let shown: LiveCopies = { kind: "connecting" };
      const show = (live: LiveCopies) => {
        if (!cancelled) {
          shown = live;
          listener.onLive(live);
        }
      };
      show(shown);
      void selectedRun(project).then(
        ({ run }) => {
          if (cancelled) {
            return;
          }
          if (!run) {
            show({ kind: "message", title: "No run yet", body: "Start a run and every copy trains here." });
            return;
          }
          const lines: LogLine[] = [];
          logs.set(run.run_id, lines);
          const endedEarlier = isFinal(run);
          const ended = (state: RunStatus) => ({
            title: `${state.name} ${state.state}`,
            body: "Open Replay to watch any of its checkpoints.",
          });
          show(
            endedEarlier
              ? { kind: "message", ...ended(run) }
              : { kind: "message", title: `${run.name} is starting`, body: "The copies appear once they are running." },
          );
          connection = open(run.run_id, {
            onStatus: (status) => {
              if (!isFinal(status)) {
                listener.onChange(["runs", "live-view"]);
                return;
              }
              listener.onChange(["runs", "live-view", "metrics", "checkpoints"]);
              const words = ended(status);
              show(
                shown.kind === "live"
                  ? { ...shown, note: `${words.title} · ${words.body}` }
                  : { kind: "message", ...words },
              );
              if (status.state === "failed" && !endedEarlier && !cancelled) {
                listener.onFailed();
              }
            },
            onMetric: () => listener.onChange(["metrics"]),
            onCheckpoint: () => listener.onChange(["checkpoints", "live-view"]),
            onSnapshot: (snapshot) => {
              runScene(run.run_id).then(
                (description) =>
                  show({
                    kind: "live",
                    scene: description,
                    step: `${compactNumber(snapshot.step)} steps`,
                    copies: snapshotCopies(snapshot),
                  }),
                (error: unknown) =>
                  show({ kind: "closed", reason: error instanceof Error ? error.message : String(error) }),
              );
            },
            onLog: (line) => {
              lines.push(line);
              lines.splice(0, Math.max(0, lines.length - MAX_LOG_LINES));
              listener.onChange(["console"]);
            },
            // An unreadable event is dropped; the next one still arrives.
            onError: () => undefined,
            onEnd: () => undefined,
            onClosed: (reason) => show({ kind: "closed", reason }),
          });
        },
        (error: unknown) => show({ kind: "closed", reason: error instanceof Error ? error.message : String(error) }),
      );
      return () => {
        cancelled = true;
        connection?.close();
      };
    },
  };
}
