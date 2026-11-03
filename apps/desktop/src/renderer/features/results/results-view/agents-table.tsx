import type { AgentComparison } from "../../../ports/agent-comparison.ts";

const HEADERS = ["Agent", "Best checkpoint", "Success there", "First success at", "Run"] as const;

// Agents trained together side by side: each one's best checkpoint and how soon it first reached its goal.
export function AgentsTable({ agents }: { agents: AgentComparison }) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-0.5 rounded-card-sm bg-control px-3 py-2.5">
        <span className="font-semibold">
          {agents.title} · {agents.rows.length} agents
        </span>
        <span className="text-ui text-fg-secondary">
          {agents.fastest
            ? `${agents.fastest} reached its goal at the earliest checkpoint.`
            : "No agent has reached its goal sooner than the others yet."}
        </span>
      </div>
      <table className="w-full text-ui">
        <thead>
          <tr className="text-left text-fg-tertiary">
            {HEADERS.map((header) => (
              <th key={header} className="py-1.5 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {agents.rows.map((row) => (
            <tr key={row.run} className="border-t border-line-subtle">
              <td className="py-1.5 font-semibold">{row.agent}</td>
              <td className="py-1.5 font-mono">{row.best}</td>
              <td className="py-1.5 font-mono">{row.success}</td>
              <td className="py-1.5 font-mono">{row.firstSuccess}</td>
              <td className="py-1.5 text-fg-secondary">{row.state}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
