import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  diagnoses: (project: string) => ["results", project, "diagnoses"] as const,
  all: (project: string) => ["results", project] as const,
};

// A new diagnosis changes the failures, summary and the copilot conversation it was posted in.
export function useAfterDiagnosis(project: string): () => void {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: resultsKeys.all(project) });
    void client.invalidateQueries({ queryKey: ["copilot", project] });
  };
}

export function useReferenceTests(project: string) {
  const port = usePort(resultsPort);
  return useQuery({ queryKey: resultsKeys.referenceTests(project), queryFn: () => port.getReferenceTests(project) });
}

export function useFailures(project: string) {
  const port = usePort(resultsPort);
  return useQuery({ queryKey: resultsKeys.failures(project), queryFn: () => port.getFailures(project) });
}
