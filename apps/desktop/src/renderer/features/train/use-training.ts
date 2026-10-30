import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePort } from "../../app/runtime/port.tsx";
import { type RunList, trainingPort } from "../../ports/training-port.ts";

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

// Writes the run list an action returned into the cache so the Runs panel shows it at once.
export function useRunsCache(project: string) {
  const client = useQueryClient();
  return (runs: RunList) => client.setQueryData(trainingKeys.runs(project), runs);
}
