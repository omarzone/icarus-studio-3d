import type { AgentStep } from "../../ports/copilot-port.ts";

const OPEN_UP_TO = 3;

// How the list of what the copilot did starts out: short lists open, long ones folded with a count.
export function stepsOverview(steps: readonly AgentStep[]): { openAtFirst: boolean; label: string } {
  const failed = steps.filter((step) => !step.ok).length;
  const count = `${steps.length} ${steps.length === 1 ? "step" : "steps"}`;
  return {
    openAtFirst: steps.length <= OPEN_UP_TO,
    label: `What the copilot did · ${count}${failed > 0 ? `, ${failed} failed` : ""}`,
  };
}
