import { compactNumber } from "../ui/compact-number.ts";
import { groupRuns } from "./agent-lanes.ts";
import { bestCheckpoint, type RunRecord } from "./results-views.ts";

// The agents of a group of runs side by side, every number read from each agent's own checkpoints.
export type AgentComparison = {
  title: string;
  rows: readonly {
    run: string;
    agent: string;
    best: string;
    success: string;
    // The first checkpoint whose evaluation reached the goal: who learned it sooner.
    firstSuccess: string;
    state: string;
  }[];
  // Which agent reached its goal at the earliest checkpoint, when any did; null otherwise.
  fastest: string | null;
};

function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`;
}

// The newest group of runs compared agent by agent, or null when the project's newest runs are not a group.
export function agentComparison(records: readonly RunRecord[]): AgentComparison | null {
  const newest = records.find((record) => record.run.group);
  const group = newest?.run.group;
  if (!group) {
    return null;
  }
  const members = groupRuns(
    records.map((record) => record.run),
    group,
  ).flatMap((run) => records.filter((record) => record.run.run_id === run.run_id));
  const firsts = members.map(
    (record) => record.checkpoints.find((checkpoint) => (checkpoint.success_rate ?? 0) > 0)?.step ?? null,
  );
  const reached = firsts.flatMap((step, index) => (step === null ? [] : [{ step, index }]));
  const earliest = reached.sort((a, b) => a.step - b.step)[0];
  const tied = earliest ? reached.filter((item) => item.step === earliest.step).length > 1 : false;
  const rows = members.map((record, index) => {
    const best = bestCheckpoint(record);
    const first = firsts[index];
    return {
      run: record.run.run_id,
      agent: record.run.agent_name ?? record.run.name,
      best: best ? compactNumber(best.step) : "—",
      success: percent(best?.success_rate),
      firstSuccess: first === null || first === undefined ? "not yet" : compactNumber(first),
      state: record.run.state,
    };
  });
  const title = (newest?.run.name ?? "").split(" · ")[0] ?? "";
  return { title, rows, fastest: earliest && !tied ? (rows[earliest.index]?.agent ?? null) : null };
}
