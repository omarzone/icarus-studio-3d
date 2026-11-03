// TAB-ALL-TEST-RUNS
import { Check, X } from "lucide-react";
import type { TestRun } from "../../../ports/results-port.ts";

// Every evaluation episode of the checkpoint with pass or fail, and how it ended.
export function AllTestRunsTab({ runs }: { runs: readonly TestRun[] }) {
  return (
    <div className="flex flex-col gap-0.5 p-1.5">
      {runs.map((run) => (
        <div key={run.id} className="flex items-center gap-2 rounded-button px-2.5 py-1.5 text-ui hover:bg-fill-hover">
          {run.passed ? (
            <Check size={13} strokeWidth={1.75} className="shrink-0 text-ok" aria-label="Passed" />
          ) : (
            <X size={13} strokeWidth={1.75} className="shrink-0 text-danger" aria-label="Failed" />
          )}
          <span className="min-w-0 flex-1 truncate">{run.label}</span>
          <span className="text-meta text-fg-tertiary">{run.passed ? "pass" : "fail"}</span>
        </div>
      ))}
    </div>
  );
}
