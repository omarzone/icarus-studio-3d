import { skipToken, useQuery } from "@tanstack/react-query";
import { usePort } from "../app/runtime/port.tsx";
import { type LiveCopies, trainingPort } from "../ports/training-port.ts";

// Queries of the training views drawn in the viewport; the Train workspace streams into them.

export const trainingViewKeys = {
  live: (project: string) => ["training", project, "live-copies"] as const,
  checkpoints: (project: string) => ["training", project, "checkpoints"] as const,
  replay: (project: string, step: number) => ["training", project, "replay", step] as const,
};

// The parallel copies of the selected run, written by the run's stream; the prototype streams nothing.
export function useLiveCopies(project: string) {
  return useQuery<LiveCopies>({ queryKey: trainingViewKeys.live(project), queryFn: skipToken });
}

export function useCheckpoints(project: string) {
  const port = usePort(trainingPort);
  return useQuery({ queryKey: trainingViewKeys.checkpoints(project), queryFn: () => port.getCheckpoints(project) });
}

export function useReplay(project: string, step: number | null) {
  const port = usePort(trainingPort);
  return useQuery({
    queryKey: trainingViewKeys.replay(project, step ?? -1),
    queryFn: step === null ? skipToken : () => port.getReplay({ project, step }),
    // A recorded episode never changes.
    staleTime: Number.POSITIVE_INFINITY,
  });
}
