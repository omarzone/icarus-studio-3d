import { Check } from "lucide-react";
import type { ProgressStep } from "../ports/progress-step.ts";

// Progress bar from the style guide: 6 px track, white fill.
export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-1.5 shrink-0 rounded-bar bg-control-raised"
    >
      <div className="h-1.5 rounded-bar bg-fg" style={{ width: `${percent}%` }} />
    </div>
  );
}

// Steps of a long job: green check when done, a spinning ring while running, an empty ring still to do.
export function ProgressSteps({ steps }: { steps: readonly ProgressStep[] }) {
  return (
    <ol className="flex flex-col gap-2.5 text-body">
      {steps.map((step) => (
        <li
          key={step.text}
          className={`flex items-center gap-2.5 ${step.state === "running" ? "font-semibold" : ""} ${step.state === "todo" ? "text-fg-tertiary" : ""}`}
        >
          <StepMark state={step.state} />
          {step.text}
        </li>
      ))}
    </ol>
  );
}

function StepMark({ state }: { state: ProgressStep["state"] }) {
  switch (state) {
    case "done":
      return <Check size={13} strokeWidth={2.5} className="shrink-0 text-ok" aria-label="Done" />;
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
