import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import type { AnswerAction } from "../../ports/copilot-port.ts";
import { type ActionPlan, planAction } from "./answer-actions.ts";
import { chatActionClass } from "./chat-actions.tsx";
import { useKnownRoute } from "./known-routes.ts";

type Props = {
  actions: readonly AnswerAction[];
  proposal: { id: string; open: boolean } | null;
  // While a message or a proposal answer is on its way, nothing else can be pressed.
  busy: boolean;
  onSend: (text: string) => void;
  onApply: (id: string) => void;
  onDiscard: (id: string) => void;
};

// The buttons the copilot offered with an answer; ones that cannot do anything here are left out.
export function AnswerActionsBar({ actions, proposal, busy, onSend, onApply, onDiscard }: Props) {
  const knownRoute = useKnownRoute();
  const usable = actions.flatMap((action) => {
    const plan = planAction(action, { proposal, knownRoute });
    return plan ? [{ label: action.label, plan }] : [];
  });
  if (usable.length === 0) {
    return null;
  }
  const press = (plan: Exclude<ActionPlan, { do: "go" }>) => {
    switch (plan.do) {
      case "apply":
        return onApply(plan.id);
      case "discard":
        return onDiscard(plan.id);
      case "send":
        return onSend(plan.text);
    }
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {usable.map(({ label, plan }, index) => {
        const className = chatActionClass(index === 0);
        if (plan.do === "go") {
          return (
            <GoTo key={label} to={plan.to} cta={label} disabled={busy} className={className}>
              {label}
            </GoTo>
          );
        }
        const used = plan.do !== "send" && plan.used;
        return (
          <Act key={label} cta={label} disabled={busy || used} onClick={() => press(plan)} className={className}>
            {label}
          </Act>
        );
      })}
    </div>
  );
}
