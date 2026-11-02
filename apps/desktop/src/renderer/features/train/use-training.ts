import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { trainingViewKeys, useRunList, useSelectedRun } from "../../editor/training-queries.ts";
import { type RunList, type TrainingChange, trainingPort } from "../../ports/training-port.ts";

export const trainingKeys = {
  runs: trainingViewKeys.runs,
  liveView: (project: string, run: string) => ["training", project, "live-view", run] as const,
  metrics: (project: string, run: string) => ["training", project, "metrics", run] as const,
  console: (project: string, run: string) => ["training", project, "console", run] as const,
  plan: (project: string) => ["training", project, "plan"] as const,
  stop: (project: string) => ["training", project, "stop"] as const,
  autopilot: (project: string) => ["training", project, "autopilot"] as const,
  failure: (project: string) => ["training", project, "failure"] as const,
};

export const useRuns = useRunList;

const AUTOPILOT_POLL_MS = 2000;

// The autopilot's settings and status, read again every 2 s while it runs. Each new step it logs may have
// posted in the conversation or started a run, so those views read again too.
export function useAutopilot(project: string) {
  const port = usePort(trainingPort);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: trainingKeys.autopilot(project),
    queryFn: () => port.getAutopilot(project),
    refetchInterval: (current) => (current.state.data?.progress?.active ? AUTOPILOT_POLL_MS : false),
  });
  const lastLine = query.data?.progress?.log.at(-1)?.id;
  useEffect(() => {
    if (lastLine === undefined) {
      return;
    }
    void client.invalidateQueries({ queryKey: ["copilot", project] });
    void client.invalidateQueries({ queryKey: trainingKeys.runs(project) });
  }, [client, project, lastLine]);
  return query;
}

export function useRunMetrics(project: string) {
  const port = usePort(trainingPort);
  const run = useSelectedRun(project);
  return useQuery({
    queryKey: trainingKeys.metrics(project, run ?? ""),
    queryFn: run === undefined ? skipToken : () => port.getMetrics(project),
  });
}

export function useRunConsole(project: string, enabled: boolean) {
  const port = usePort(trainingPort);
  const run = useSelectedRun(project);
  return useQuery({
    queryKey: trainingKeys.console(project, run ?? ""),
    queryFn: run === undefined ? skipToken : () => port.getConsole(project),
    enabled,
  });
}

export function useLiveView(project: string) {
  const port = usePort(trainingPort);
  const run = useSelectedRun(project);
  return useQuery({
    queryKey: trainingKeys.liveView(project, run ?? ""),
    queryFn: run === undefined ? skipToken : () => port.getLiveView(project),
    // Without a run there is no card; the live view says so.
    retry: false,
  });
}

// Whether a run of the project is training now, so the header offers Stop instead of Train.
export function useIsTraining(project: string): boolean {
  return useRuns(project).data?.runs.some((run) => run.status === "running") ?? false;
}

// Writes the run list an action returned into the cache so the Runs panel shows it at once.
export function useRunsCache(project: string) {
  const client = useQueryClient();
  return (runs: RunList) => client.setQueryData(trainingKeys.runs(project), runs);
}

function changedKey(project: string, run: string, change: TrainingChange) {
  switch (change) {
    case "runs":
      return trainingKeys.runs(project);
    case "metrics":
      return trainingKeys.metrics(project, run);
    case "checkpoints":
      return trainingViewKeys.checkpoints(project, run);
    case "console":
      return trainingKeys.console(project, run);
    case "live-view":
      return trainingKeys.liveView(project, run);
  }
}

// Streams the selected run into the caches while the Train workspace is open; a run that fails shows why.
export function useTrainingStream(project: string): { reconnect: () => void } {
  const port = usePort(trainingPort);
  const client = useQueryClient();
  const go = useNavigation((state) => state.go);
  const selected = useRuns(project).data?.selected;
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    // Read again on reconnect and when the selection changes.
    void attempt;
    const run = selected ?? "";
    return port.watch(project, {
      onLive: (live) => client.setQueryData(trainingViewKeys.live(project), live),
      onChange: (changes) => {
        for (const change of new Set(changes)) {
          void client.invalidateQueries({ queryKey: changedKey(project, run, change), exact: true });
        }
      },
      onFailed: () => go("STA-TRAIN-FAILED"),
    });
  }, [port, project, client, go, selected, attempt]);
  return { reconnect: () => setAttempt((count) => count + 1) };
}
