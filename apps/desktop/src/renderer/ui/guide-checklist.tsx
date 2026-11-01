import { Check } from "lucide-react";
import { Act } from "../app/navigation/go-to.tsx";
import { useNavigation } from "../app/navigation/navigation-store.tsx";
import { useCopilotOutbox } from "../app/runtime/copilot-outbox.ts";
import type { GuideStep } from "../ports/scene-port.ts";
import { buttonClass } from "./button-styles.ts";
import { type GuideAction, guideStepViews, nextGuideAction } from "./guide-steps.ts";

type Props = {
  steps: readonly GuideStep[];
  // The open project: its chat receives the requests the steps send to the copilot.
  project: string;
  // Called after a step's action ran (a popover closes itself).
  onAct?: () => void;
};

// The getting-started checklist: what the project has, what it still needs, and one click to do the next step.
export function GuideChecklist({ steps, project, onAct }: Props) {
  const run = useGuideAction(project, onAct);
  const next = nextGuideAction(steps);
  const views = guideStepViews(steps);
  const allDone = views.every((item) => item.done);
  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-1">
        {views.map((step) => (
          <li key={step.id} className="flex gap-2.5 rounded-control px-1 py-1.5">
            {step.done ? (
              <Check size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-ok" aria-label="Done" />
            ) : (
              <span
                role="img"
                aria-label="To do"
                className="mt-0.5 size-3.5 shrink-0 rounded-full border-[1.5px] border-fg-disabled"
              />
            )}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={step.done ? "text-fg-secondary" : "font-semibold"}>{step.label}</span>
              <span className="text-ui text-fg-tertiary">{step.detail}</span>
              {step.action && step.action !== next ? (
                <Act
                  cta={step.action.label}
                  onClick={() => step.action && run(step.action)}
                  className="self-start rounded-control text-ui text-fg-secondary underline hover:text-fg active:opacity-80"
                >
                  {step.action.label}
                </Act>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
      {next ? (
        <Act cta={next.label} onClick={() => run(next)} className={buttonClass("primary", "self-stretch")}>
          {allDone ? next.label : `Next: ${next.label}`}
        </Act>
      ) : null}
      <span className="text-meta text-fg-tertiary">
        You can also do every step by asking in the chat, in your own words.
      </span>
    </div>
  );
}

function useGuideAction(project: string, onAct: (() => void) | undefined) {
  const go = useNavigation((state) => state.go);
  const ask = useCopilotOutbox((state) => state.ask);
  return (action: GuideAction) => {
    onAct?.();
    switch (action.kind) {
      case "ask":
        ask(project, action.message);
        return;
      case "go":
        go(action.to);
        return;
    }
  };
}
