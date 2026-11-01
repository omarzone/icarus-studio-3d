import { Check } from "lucide-react";
import type { HardwareSession, HardwareStepStatus } from "../../../ports/build-port.ts";

const circleClass: Readonly<Record<HardwareStepStatus, string>> = {
  done: "bg-selected text-on-selected",
  current: "bg-selected text-on-selected",
  todo: "bg-control-raised text-fg-tertiary",
};

const labelClass: Readonly<Record<HardwareStepStatus, string>> = {
  done: "",
  current: "font-semibold",
  todo: "text-fg-tertiary",
};

// The guided steps to run a brain on a device; done steps show a check, the current one is highlighted.
export function HardwareSteps({ steps }: { steps: HardwareSession["steps"] }) {
  return (
    <nav aria-label="Real hardware" className="flex flex-col gap-1 pt-3.5 pr-3">
      <span className="px-3 pt-1 pb-2 text-meta leading-[15px] text-fg-tertiary">Real hardware</span>
      <ol className="flex flex-col gap-1">
        {steps.map((step, index) => (
          <li
            key={step.label}
            aria-current={step.status === "current" ? "step" : undefined}
            className={`flex items-center gap-2.5 rounded-card-sm px-3 py-2.5 ${step.status === "current" ? "bg-control" : ""}`}
          >
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full text-ui font-bold ${circleClass[step.status]}`}
            >
              {step.status === "done" ? <Check size={13} strokeWidth={2.4} aria-label="Done" /> : index + 1}
            </span>
            <span className={labelClass[step.status]}>{step.label}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
