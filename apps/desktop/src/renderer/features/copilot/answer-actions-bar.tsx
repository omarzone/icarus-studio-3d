import { useState } from "react";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { useSceneCache } from "../../editor/scene-queries.ts";
import type { AnswerAction } from "../../ports/copilot-port.ts";
import { scenePort } from "../../ports/scene-port.ts";
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
  // Applies the proposal, then opens the start training dialog.
  onApplyAndTrain?: (id: string) => void;
};

// Selects an object of the open project and opens the World view on it.
function useShowObject(): (id: string) => void {
  const project = useNavigation((state) => state.params.project) ?? "";
  const go = useNavigation((state) => state.go);
  const port = usePort(scenePort);
  const cache = useSceneCache(project);
  return (id) => {
    go("SCR-WORLD");
    void port.selectObject({ scene: project, id }).then(cache.tree, () => undefined);
  };
}

// The buttons the copilot offered with an answer; ones that cannot do anything here are left out.
export function AnswerActionsBar({ actions, proposal, busy, onSend, onApply, onDiscard, onApplyAndTrain }: Props) {
  const knownRoute = useKnownRoute();
  const show = useShowObject();
  const [dismissed, setDismissed] = useState(false);
  const usable = actions.flatMap((action) => {
    const plan = planAction(action, { proposal, knownRoute });
    return plan && (plan.do !== "apply_and_train" || onApplyAndTrain) ? [{ label: action.label, plan }] : [];
  });
  if (usable.length === 0 || dismissed) {
    return null;
  }
  const press = (plan: Exclude<ActionPlan, { do: "go" }>) => {
    switch (plan.do) {
      case "apply":
        return onApply(plan.id);
      case "discard":
        return onDiscard(plan.id);
      case "apply_and_train":
        return onApplyAndTrain?.(plan.id);
      case "send":
        return onSend(plan.text);
      case "show":
        return show(plan.target);
      case "dismiss":
        return setDismissed(true);
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
        const used = (plan.do === "apply" || plan.do === "discard" || plan.do === "apply_and_train") && plan.used;
        return (
          <Act key={label} cta={label} disabled={busy || used} onClick={() => press(plan)} className={className}>
            {label}
          </Act>
        );
      })}
    </div>
  );
}
