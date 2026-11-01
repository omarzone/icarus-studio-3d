// TAB-RUNS
import { Act } from "../../../app/navigation/go-to.tsx";
import type { RunList, RunSummary } from "../../../ports/training-port.ts";

function statusText(run: RunSummary): string {
  if (run.status === "running") {
    return `● ${Math.round((run.progress ?? 0) * 100)}%`;
  }
  return run.status;
}

const STATUS_TONE: Record<RunSummary["status"], string> = {
  running: "text-ok",
  paused: "text-warn",
  done: "text-fg-tertiary",
  stopped: "text-fg-tertiary",
  failed: "text-danger",
};

// Every training run with its status and a one-line result.
export function RunsTab({ list, onSelect }: { list: RunList; onSelect: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-0.5 p-1.5">
      {list.runs.map((run) => {
        const selected = run.id === list.selected;
        return (
          <Act
            key={run.id}
            cta={run.name}
            aria-current={selected ? "true" : undefined}
            onClick={() => onSelect(run.id)}
            className={`flex flex-col gap-0.75 rounded-button p-2.5 text-left ${selected ? "bg-control-raised" : "hover:bg-fill-hover"}`}
          >
            <span className="flex w-full items-center gap-2 leading-4">
              <span className="font-semibold">{run.name}</span>
              <span className={`ml-auto text-meta ${STATUS_TONE[run.status]}`}>{statusText(run)}</span>
            </span>
            <span className="text-meta text-fg-tertiary">{run.detail}</span>
          </Act>
        );
      })}
    </div>
  );
}
