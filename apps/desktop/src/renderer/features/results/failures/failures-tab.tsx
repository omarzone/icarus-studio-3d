// TAB-FAILURES
import { Act } from "../../../app/navigation/go-to.tsx";
import type { Failures } from "../../../ports/results-port.ts";

// Failure groups found by the copilot, each with a thumbnail and how many test runs it covers.
export function FailuresTab({ failures, onSelect }: { failures: Failures; onSelect: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-0.5 p-1.5">
      {failures.groups.map((group) => {
        const selected = group.id === failures.selected;
        return (
          <Act
            key={group.id}
            cta={`${group.title}\n${group.count}`}
            aria-current={selected ? "true" : undefined}
            onClick={() => onSelect(group.id)}
            className={`grid grid-cols-[74px_minmax(0,1fr)] items-center gap-2.5 rounded-card-sm p-2 text-left ${
              selected ? "bg-control-raised" : "hover:bg-fill-hover"
            }`}
          >
            <span
              role="img"
              aria-label={`Replay of ${group.title}`}
              className="h-12.5 w-18.5 rounded-control bg-panel"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold">{group.title}</span>
              <span className="text-meta text-fg-tertiary">{group.count}</span>
            </span>
          </Act>
        );
      })}
    </div>
  );
}
