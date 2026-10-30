import { useQuery } from "@tanstack/react-query";
import { usePort } from "../../app/runtime/port.tsx";
import { resultsPort, type SummaryView } from "../../ports/results-port.ts";

export const resultsKeys = {
  runs: (project: string) => ["results", project, "runs"] as const,
  bestBrains: (project: string) => ["results", project, "best-brains"] as const,
  summary: (project: string, view: SummaryView) => ["results", project, "summary", view] as const,
  notes: (project: string) => ["results", project, "notes"] as const,
  comparison: (project: string) => ["results", project, "comparison"] as const,
  history: (project: string) => ["results", project, "history"] as const,
  failures: (project: string) => ["results", project, "failures"] as const,
  testRuns: (project: string) => ["results", project, "test-runs"] as const,
  replay: (project: string) => ["results", project, "replay"] as const,
  timelapse: (project: string) => ["results", project, "timelapse"] as const,
  referenceTests: (project: string) => ["results", project, "reference-tests"] as const,
  recordings: (project: string) => ["results", project, "recordings"] as const,
  referenceComparison: (project: string, test: string) => ["results", project, "reference", test] as const,
  behaviorMatch: (project: string) => ["results", project, "behavior-match"] as const,
  neurons: (project: string) => ["results", project, "neurons"] as const,
};

export function useReferenceTests(project: string) {
  const port = usePort(resultsPort);
  return useQuery({ queryKey: resultsKeys.referenceTests(project), queryFn: () => port.getReferenceTests(project) });
}

export function useFailures(project: string) {
  const port = usePort(resultsPort);
  return useQuery({ queryKey: resultsKeys.failures(project), queryFn: () => port.getFailures(project) });
}
