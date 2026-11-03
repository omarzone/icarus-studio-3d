// TAB-COMPARE
import { ViewportSurface } from "../../../editor/viewport/viewport-surface.tsx";
import type { Comparison } from "../../../ports/results-port.ts";
import { StatusPill } from "../../../ui/status-pill.tsx";
import { AgentsTable } from "./agents-table.tsx";
import { CompareTableView } from "./compare-table.tsx";

// Two runs side by side on the same seed, each with its score chips.
export function CompareTab({ comparison }: { comparison: Comparison }) {
  if (comparison.agents) {
    return <AgentsTable agents={comparison.agents} />;
  }
  if (comparison.table) {
    return <CompareTableView comparison={comparison} table={comparison.table} />;
  }
  return (
    <div className="flex h-full gap-2 p-2">
      {comparison.sides.map((side) => (
        <div key={side.id} className="flex min-w-0 flex-1 overflow-hidden rounded-card-sm">
          <ViewportSurface
            label={`Replay of ${side.title}`}
            overlays={
              <div className="absolute top-3 left-3 flex flex-col gap-1.5 rounded-card-sm bg-overlay px-3 py-2">
                <span className="font-semibold">{side.title}</span>
                <span className="flex gap-1.5">
                  {side.chips.map((chip) => (
                    <StatusPill key={chip.text} tone={chip.tone}>
                      {chip.text}
                    </StatusPill>
                  ))}
                </span>
              </div>
            }
          />
        </div>
      ))}
    </div>
  );
}
