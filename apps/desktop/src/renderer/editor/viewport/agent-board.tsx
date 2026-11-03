import type { AgentScore } from "../../ports/agent-lanes.ts";
import { compactNumber } from "../../ui/compact-number.ts";

// One line per agent training together: its name, how far its run is and its latest success, as the engine reports.
export function AgentBoard({ agents }: { agents: readonly AgentScore[] }) {
  return (
    <ol
      aria-label="Agents"
      className="pointer-events-none flex min-w-56 flex-col gap-1 rounded-card-sm bg-overlay px-3 py-2 text-meta"
    >
      {agents.map((agent, index) => (
        <li key={agent.run} className="flex items-baseline justify-between gap-3">
          <span className="font-semibold">
            {index + 1}. {agent.name}
          </span>
          <span className="font-mono text-fg-secondary">{agentLine(agent)}</span>
        </li>
      ))}
    </ol>
  );
}

export function agentLine(agent: AgentScore): string {
  const steps = `${compactNumber(agent.step)}/${compactNumber(agent.total)}`;
  const success = agent.success === null ? "no test yet" : `${Math.round(agent.success * 100)}% success`;
  return agent.state === "running" || agent.state === "starting"
    ? `${steps} · ${success}`
    : `${agent.state} · ${success}`;
}
