// TAB-BEHAVIOR-MATCH
import type { BehaviorMatch } from "../../../ports/results-port.ts";
import { StatusPill } from "../../../ui/status-pill.tsx";

const COLUMNS = "grid grid-cols-[1.6fr_1fr_1fr_80px] items-center gap-2.5 px-2.5";

// Each behavior with its recorded and simulated value, and whether they are close.
export function BehaviorMatchTab({ rows }: { rows: readonly BehaviorMatch[] }) {
  return (
    <div className="flex flex-col gap-0.5 px-2.5 py-2 text-ui">
      <div className={`${COLUMNS} py-1 text-fg-tertiary`}>
        <span>Behavior</span>
        <span>Real flies</span>
        <span>Your fly</span>
        <span />
      </div>
      {rows.map((row, index) => (
        <div key={row.behavior} className={`${COLUMNS} rounded-button py-2 ${index % 2 === 0 ? "bg-control" : ""}`}>
          <span>{row.behavior}</span>
          <span className="font-mono">{row.recorded}</span>
          <span className="font-mono">{row.simulated}</span>
          <StatusPill tone={row.verdict === "close" ? "ok" : "warn"}>{row.verdict}</StatusPill>
        </div>
      ))}
    </div>
  );
}
