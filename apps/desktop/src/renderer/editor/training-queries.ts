import { skipToken, useQuery } from "@tanstack/react-query";
import { usePort } from "../app/runtime/port.tsx";
import { type LiveCopies, trainingPort } from "../ports/training-port.ts";

// Queries of the training views drawn in the viewport; the Train workspace streams into them.

// Views of one run carry its id, so selecting or starting another run never shows the previous run's data.
export const trainingViewKeys = {
  runs: (project: string) => ["training", project, "runs"] as const,
  live: (project: string) => ["training", project, "live-copies"] as const,
  checkpoints: (project: string, run: string) => ["training", project, "checkpoints", run] as const,
  replay: (project: string, run: string, step: number) => ["training", project, "replay", run, step] as const,
};

// A run's card must follow it to the end even when no stream watches it (started from the chat or the autopilot, or
// not the selected one), so the list re-reads itself: often while a run trains, now and then otherwise.
const ACTIVE_RUNS_REFRESH_MS = 2000;
const IDLE_RUNS_REFRESH_MS = 10_000;

export function useRunList(project: string) {
  const port = usePort(trainingPort);
  return useQuery({
    queryKey: trainingViewKeys.runs(project),
    queryFn: () => port.listRuns(project),
    refetchInterval: (query) =>
      query.state.data?.runs.some((run) => run.status === "running") ? ACTIVE_RUNS_REFRESH_MS : IDLE_RUNS_REFRESH_MS,
  });
}

// The id of the run the views show, undefined until the run list has loaded.
export function useSelectedRun(project: string): string | undefined {
  return useRunList(project).data?.selected;
}

// The parallel copies of the selected run, written by the run's stream; the prototype streams nothing.
export function useLiveCopies(project: string) {
  return useQuery<LiveCopies>({ queryKey: trainingViewKeys.live(project), queryFn: skipToken });
}

export function useCheckpoints(project: string) {
  const port = usePort(trainingPort);
  const run = useSelectedRun(project);
  return useQuery({
    queryKey: trainingViewKeys.checkpoints(project, run ?? ""),
    queryFn: run === undefined ? skipToken : () => port.getCheckpoints(project),
  });
}

export function useReplay(project: string, step: number | null) {
  const port = usePort(trainingPort);
  const run = useSelectedRun(project);
  return useQuery({
    queryKey: trainingViewKeys.replay(project, run ?? "", step ?? -1),
    queryFn: step === null || run === undefined ? skipToken : () => port.getReplay({ project, step }),
    // A recorded episode never changes.
    staleTime: Number.POSITIVE_INFINITY,
  });
}
