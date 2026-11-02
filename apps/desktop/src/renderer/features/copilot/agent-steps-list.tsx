import {
  ChevronDown,
  CircleAlert,
  Dumbbell,
  Eye,
  FileSearch,
  FlaskConical,
  Library,
  type LucideIcon,
  PencilLine,
} from "lucide-react";
import { useState } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import type { AgentStep, AgentTool } from "../../ports/copilot-port.ts";
import { stepsOverview } from "./agent-steps.ts";

const ICONS: Record<AgentTool, LucideIcon> = {
  inspect: FileSearch,
  look: Eye,
  try: FlaskConical,
  propose: PencilLine,
  train: Dumbbell,
  library: Library,
};

// "What the copilot did": the steps it took before answering, open while short, folded when long.
export function AgentStepsList({ steps }: { steps: readonly AgentStep[] }) {
  const overview = stepsOverview(steps);
  const [open, setOpen] = useState(overview.openAtFirst);
  return (
    <div className="flex max-w-[calc(92%+28px)] min-w-0 flex-col gap-1 self-start">
      <Act
        cta="What the copilot did"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 self-start rounded-control px-1 py-0.5 text-meta text-fg-tertiary hover:bg-fill-hover hover:text-fg active:opacity-80"
      >
        {overview.label}
        <ChevronDown size={12} strokeWidth={1.75} aria-hidden className={open ? "rotate-180" : ""} />
      </Act>
      {open ? (
        <ol className="flex flex-col gap-1 border-l-2 border-line-strong pl-2.5">
          {steps.map((step, index) => {
            const Icon = step.ok ? ICONS[step.tool] : CircleAlert;
            return (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: steps of a sent answer never reorder.
                key={index}
                className={`flex items-start gap-2 text-meta leading-normal ${step.ok ? "text-fg-secondary" : "text-fg-tertiary"}`}
              >
                <Icon
                  size={12}
                  strokeWidth={1.75}
                  aria-label={step.ok ? step.tool : "Failed"}
                  className={`mt-0.5 shrink-0 ${step.ok ? "text-fg-tertiary" : "text-warn"}`}
                />
                <span className="min-w-0 wrap-break-word">{step.summary}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
