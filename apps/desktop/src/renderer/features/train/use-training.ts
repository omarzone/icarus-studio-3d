import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { trainingViewKeys } from "../../editor/training-queries.ts";
import { type RunList, type TrainingChange, trainingPort } from "../../ports/training-port.ts";

export const trainingKeys = {
  runs: (project: string) => ["training", project, "runs"] as const,
  liveView: (project: string) => ["training", project, "live-view"] as const,
  metrics: (project: string) => ["training", project, "metrics"] as const,
  console: (project: string) => ["training", project, "console"] as const,
  plan: (project: string) => ["training", project, "plan"] as const,
  stop: (project: string) => ["training", project, "stop"] as const,
  autopilot: (project: string) => ["training", project, "autopilot"] as const,
  failure: (project: string) => ["training", project, "failure"] as const,
};

export function useRuns(project: string) {
  const port = usePort(trainingPort);
  return useQuery({ queryKey: trainingKeys.runs(project), queryFn: () => port.listRuns(project) });
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

function changedKey(project: string, change: TrainingChange) {
  switch (change) {
    case "runs":
      return trainingKeys.runs(project);
    case "metrics":
      return trainingKeys.metrics(project);
    case "checkpoints":
      return trainingViewKeys.checkpoints(project);
    case "console":
      return trainingKeys.console(project);
    case "live-view":
      return trainingKeys.liveView(project);
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
    void [selected, attempt];
    return port.watch(project, {
      onLive: (live) => client.setQueryData(trainingViewKeys.live(project), live),
      onChange: (changes) => {
        for (const change of new Set(changes)) {
          void client.invalidateQueries({ queryKey: changedKey(project, change), exact: true });
        }
      },
      onFailed: () => go("STA-TRAIN-FAILED"),
    });
  }, [port, project, client, go, selected, attempt]);
  return { reconnect: () => setAttempt((count) => count + 1) };
}
