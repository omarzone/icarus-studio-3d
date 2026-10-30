// TAB-RESULT-RUNS
import { Act } from "../../../app/navigation/go-to.tsx";
import type { ResultRun } from "../../../ports/results-port.ts";

// Runs with a checkbox to compare them and their score.
export function ResultRunsTab({ runs, onToggle }: { runs: readonly ResultRun[]; onToggle: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-0.5 p-1.5">
      {runs.map((run) => (
        <Act
          key={run.id}
          cta={run.name}
          role="checkbox"
          aria-checked={run.compared}
          title={run.compared ? "Remove from the comparison" : "Add to the comparison"}
          onClick={() => onToggle(run.id)}
          className={`flex items-center gap-2.5 rounded-button px-2.5 py-2.25 text-left ${
            run.current ? "bg-control-raised hover:bg-fill-hover" : "hover:bg-fill-hover"
          }`}
        >
          <span
            aria-hidden
            className={`size-4 shrink-0 rounded-[4px] border-[1.5px] border-fg-disabled ${run.compared ? "bg-fg" : ""}`}
          />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold">{run.name}</span>
            <span className="truncate text-meta text-fg-tertiary">{run.detail}</span>
          </span>
          <span className="font-mono text-ui">{run.score}</span>
        </Act>
      ))}
    </div>
  );
}
