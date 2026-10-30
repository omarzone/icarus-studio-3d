// TAB-GOAL
import type { Learning } from "../../../ports/brain-port.ts";

// What success means and when an episode ends.
export function GoalTab({ goal }: { goal: Learning["goal"] }) {
  return (
    <div className="grid h-full grid-cols-3 gap-2.5 px-3 pt-2.5 pb-3">
      <GoalCard title="Success" text={goal.success} />
      <GoalCard title="Time limit" text={goal.timeLimit} />
      <GoalCard title="An episode ends when" text={goal.endsWhen.join(" · ")} />
    </div>
  );
}

function GoalCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-card-sm bg-control px-3 py-2.5">
      <span className="font-semibold">{title}</span>
      <span className="text-ui text-fg-secondary">{text}</span>
    </div>
  );
}
