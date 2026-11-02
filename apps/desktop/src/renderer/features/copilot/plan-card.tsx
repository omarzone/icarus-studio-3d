import type { ReactNode } from "react";
import type { NextStepPlan } from "../../ports/copilot-port.ts";
import { ChatActions } from "./chat-actions.tsx";
import type { SuggestionRoutes } from "./suggestion-chips.tsx";

type Props = {
  plan: NextStepPlan;
  routes: SuggestionRoutes;
  onSend: (text: string) => void;
  // Drawn instead of the actions once the plan was answered; nothing at all when null.
  answered?: ReactNode;
};

const MARKS = {
  add: { sign: "+", className: "bg-ok-tint text-ok", label: "Added" },
  change: { sign: "~", className: "bg-warn-tint text-warn", label: "Changed" },
} as const;

// What the copilot suggests for the next step: each addition or change, then the actions that take it.
export function PlanCard({ plan, routes, onSend, answered }: Props) {
  return (
    <div className="flex flex-col gap-2 rounded-bubble bg-control px-3.5 py-3">
      <span className="font-semibold">{plan.title}</span>
      {plan.items.map((item) => {
        const mark = MARKS[item.mark];
        return (
          <span key={item.label} className="flex items-center gap-2.25">
            <span
              role="img"
              aria-label={mark.label}
              className={`grid size-4.5 shrink-0 place-items-center rounded-[6px] font-semibold ${mark.className}`}
            >
              {mark.sign}
            </span>
            <span className="font-medium">{item.label}</span>
            <span className="text-fg-tertiary">{item.detail}</span>
          </span>
        );
      })}
      {answered === undefined ? (
        <div className="mt-1">
          <ChatActions actions={plan.actions} routes={routes} onSend={onSend} large />
        </div>
      ) : (
        answered
      )}
    </div>
  );
}
