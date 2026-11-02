import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import type { GoalState, RunProgress } from "../../ports/copilot-port.ts";
import { runCardProgress } from "../../ports/copilot-views.ts";
import { trainingPort } from "../../ports/training-port.ts";
import { trainingKeys } from "../train/use-training.ts";

const RUN_POLL_MS = 2000;

// A run an answer is about, read again every 2 s while it trains; nothing is drawn once the project lost it.
export function LiveRunCard({ runId }: { runId: string }) {
  const project = useNavigation((state) => state.params.project) ?? "";
  const port = usePort(trainingPort);
  const runs = useQuery({
    queryKey: trainingKeys.runs(project),
    queryFn: () => port.listRuns(project),
    enabled: project !== "",
    refetchInterval: (query) =>
      query.state.data?.runs.some((run) => run.id === runId && run.status === "running") ? RUN_POLL_MS : false,
  });
  const run = runs.data?.runs.find((item) => item.id === runId);
  if (runs.isPending && project !== "") {
    return (
      <div role="status" className="rounded-bubble bg-control p-3.5 text-ui text-fg-tertiary">
        Reading the run…
      </div>
    );
  }
  return run ? <RunProgressCard progress={runCardProgress(run)} /> : null;
}

// A training run as the copilot reports it: progress bar and its goals, done, running or still to do.
export function RunProgressCard({ progress }: { progress: RunProgress }) {
  const percent = Math.round(progress.done * 100);
  return (
    <div className="flex flex-col gap-2.75 rounded-bubble bg-control p-3.5">
      <div className="flex items-center gap-2 leading-4">
        <span className="font-semibold">{progress.title}</span>
        <span className="text-ui text-fg-tertiary">{progress.meta}</span>
        <span className="ml-auto font-semibold">{percent}%</span>
      </div>
      <div className="h-1.5 rounded-bar bg-control-raised">
        <div className="h-1.5 rounded-bar bg-fg" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex flex-col gap-2.25 text-ui leading-tight">
        {progress.goals.map((goal) => (
          <span key={goal.text} className={GOAL_TEXT[goal.state]}>
            <GoalMark state={goal.state} />
            {goal.text}
          </span>
        ))}
      </div>
    </div>
  );
}

const GOAL_TEXT: Record<GoalState, string> = {
  done: "flex items-center gap-2.25 text-fg-tertiary line-through",
  running: "flex items-center gap-2.25 font-medium",
  todo: "flex items-center gap-2.25 text-fg-tertiary",
};

function GoalMark({ state }: { state: GoalState }) {
  switch (state) {
    case "done":
      return <Check size={13} strokeWidth={1.75} className="shrink-0 text-ok" aria-label="Done" />;
    case "running":
      return (
        <span
          role="img"
          aria-label="Running"
          className="size-3.25 shrink-0 animate-spin rounded-full border-2 border-fg border-r-transparent"
        />
      );
    case "todo":
      return (
        <span
          role="img"
          aria-label="To do"
          className="size-3.25 shrink-0 rounded-full border-[1.5px] border-fg-disabled"
        />
      );
  }
}

// A point in the run the next messages belong to.
export function MilestoneDivider({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5 text-meta leading-tight text-fg-tertiary">
      <span aria-hidden className="h-px flex-1 bg-line" />
      {text}
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  );
}
