import type { CompareTable, Comparison } from "../../../ports/results-port.ts";
import { StatusPill } from "../../../ui/status-pill.tsx";

// Two real runs side by side: their score chips and every number read from their checkpoints.
export function CompareTableView({ comparison, table }: { comparison: Comparison; table: CompareTable }) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="grid grid-cols-2 gap-2">
        {comparison.sides.map((side) => (
          <div key={side.id} className="flex flex-col gap-1.5 rounded-card-sm bg-control px-3 py-2.5">
            <span className="font-semibold">{side.title}</span>
            <span className="flex flex-wrap gap-1.5">
              {side.chips.map((chip) => (
                <StatusPill key={chip.text} tone={chip.tone}>
                  {chip.text}
                </StatusPill>
              ))}
            </span>
          </div>
        ))}
      </div>
      <table className="w-full text-ui">
        <thead>
          <tr className="text-left text-fg-tertiary">
            <th className="py-1.5 font-medium">Measure</th>
            <th className="py-1.5 font-medium">{table.columns[0]}</th>
            <th className="py-1.5 font-medium">{table.columns[1]}</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.label} className="border-t border-line-subtle">
              <td className="py-1.5 text-fg-secondary">{row.label}</td>
              <td className="py-1.5 font-mono">{row.values[0]}</td>
              <td className="py-1.5 font-mono">{row.values[1]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
