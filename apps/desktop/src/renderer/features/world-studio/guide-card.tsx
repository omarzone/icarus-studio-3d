import { Check, ListChecks } from "lucide-react";
import { GoTo } from "../../app/navigation/go-to.tsx";
import type { GuideProgress } from "../../ports/scene-port.ts";

// The five getting-started steps and the workspace each one lives in; they can be done in any order.
const STEPS = [
  { label: "Describe your idea, or import a model", place: "Chat" },
  { label: "Set up the world", place: "World" },
  { label: "Give it a body and sensors", place: "Body" },
  { label: "Choose what it should learn", place: "Brain" },
  { label: "Train and watch it learn", place: "Train" },
] as const;

export function guideLabel(guide: GuideProgress | undefined): string {
  return guide?.started ? `Getting started ${guide.done}/${guide.total}` : "Guide";
}

export function GuideCard({ guide }: { guide: GuideProgress }) {
  return (
    <div className="flex w-82.5 flex-col gap-2 rounded-[18px] bg-floating p-4">
      <div className="flex items-center">
        <span className="font-semibold">Getting started</span>
        <span className="ml-auto text-ui text-fg-tertiary">
          {guide.done} of {guide.total}
        </span>
      </div>
      <span className="text-ui leading-[1.45] text-fg-secondary">
        Go in any order. Every step can also be done by asking in the chat.
      </span>
      <ol className="flex flex-col text-ui">
        {STEPS.map((step, index) => (
          <li key={step.label} className="flex items-center gap-2.5 py-1.75">
            {index < guide.done ? (
              <Check size={13} strokeWidth={1.75} className="text-ok" aria-label="Done" />
            ) : (
              <span
                role="img"
                aria-label="To do"
                className="size-3.25 rounded-full border-[1.5px] border-fg-disabled"
              />
            )}
            <span className="flex-1">{step.label}</span>
            <span className="rounded-full bg-control-raised px-2 py-0.5 text-meta text-fg-secondary">{step.place}</span>
          </li>
        ))}
      </ol>
      <div className="mt-1 flex gap-1.5">
        <GoTo
          to="STA-WORLD-EMPTY-NOGUIDE"
          cta="Hide guide"
          className="h-7.5 rounded-full bg-fill-ghost px-3 text-ui text-fg hover:bg-control-raised"
        >
          Hide guide
        </GoTo>
        <GoTo
          to="STA-WORLD-EMPTY-NOGUIDE"
          cta="I will explore on my own"
          className="h-7.5 rounded-full px-3 text-ui text-fg-tertiary hover:bg-fill-hover hover:text-fg"
        >
          I will explore on my own
        </GoTo>
      </div>
    </div>
  );
}

export function ShowGuidePill({ guide }: { guide: GuideProgress }) {
  return (
    <GoTo
      to="STA-WORLD-EMPTY"
      cta={`Show guide · ${guide.done} of ${guide.total}`}
      className="flex h-8 items-center gap-2 rounded-full bg-floating px-3 text-ui hover:bg-control-raised"
    >
      <ListChecks size={14} strokeWidth={1.75} aria-hidden />
      Show guide · {guide.done} of {guide.total}
    </GoTo>
  );
}
