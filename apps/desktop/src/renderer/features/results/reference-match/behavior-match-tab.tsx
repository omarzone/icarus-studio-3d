// TAB-BEHAVIOR-MATCH
import type { BehaviorMatchTable } from "../../../ports/results-port.ts";
import { StatusPill } from "../../../ui/status-pill.tsx";

const COLUMNS = "grid grid-cols-[1.6fr_1fr_1fr_80px] items-center gap-2.5 px-2.5";

// Each measured behavior on both sides, and whether they are close.
export function BehaviorMatchTab({ table }: { table: BehaviorMatchTable }) {
  return (
    <div className="flex flex-col gap-0.5 px-2.5 py-2 text-ui">
      <div className={`${COLUMNS} py-1 text-fg-tertiary`}>
        <span>Behavior</span>
        <span className="truncate">{table.columns[0]}</span>
        <span className="truncate">{table.columns[1]}</span>
        <span />
      </div>
      {table.rows.map((row, index) => (
        <div key={row.behavior} className={`${COLUMNS} rounded-button py-2 ${index % 2 === 0 ? "bg-control" : ""}`}>
          <span>{row.behavior}</span>
          <span className="font-mono">{row.a}</span>
          <span className="font-mono">{row.b}</span>
          <StatusPill tone={row.verdict === "close" ? "ok" : "warn"}>{row.verdict}</StatusPill>
        </div>
      ))}
      {table.note ? <span className="px-2.5 pt-1.5 text-meta text-fg-tertiary">{table.note}</span> : null}
    </div>
  );
}
