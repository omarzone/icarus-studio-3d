// TAB-ALL-TEST-RUNS
import { Check, X } from "lucide-react";
import { Act } from "../../../app/navigation/go-to.tsx";
import type { TestRun } from "../../../ports/results-port.ts";

// Every evaluation episode with pass or fail; any of them can be replayed.
export function AllTestRunsTab({ runs }: { runs: readonly TestRun[] }) {
  return (
    <div className="flex flex-col gap-0.5 p-1.5">
      {runs.map((run) => (
        <Act
          key={run.id}
          cta={run.label}
          title="Replay this test run"
          className="flex items-center gap-2 rounded-button px-2.5 py-1.5 text-left text-ui hover:bg-fill-hover"
        >
          {run.passed ? (
            <Check size={13} strokeWidth={1.75} className="text-ok" aria-label="Passed" />
          ) : (
            <X size={13} strokeWidth={1.75} className="text-danger" aria-label="Failed" />
          )}
          <span className="flex-1">{run.label}</span>
          <span className="text-meta text-fg-tertiary">{run.passed ? "pass" : "fail"}</span>
        </Act>
      ))}
    </div>
  );
}
