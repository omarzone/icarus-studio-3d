import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGuide } from "../../../editor/scene-queries.ts";
import { useAnchoredStyle } from "../../../ui/anchored.ts";
import { buttonClass } from "../../../ui/button-styles.ts";
import { useDismiss } from "../../../ui/dismiss.ts";
import { GuideChecklist } from "../../../ui/guide-checklist.tsx";
import { Act } from "../../navigation/go-to.tsx";

// The header's guide pill in the app: opens the getting-started checklist in place, over any workspace.
export function GuideButton({ project, label }: { project: string; label: string }) {
  const guide = useGuide(project);
  const button = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const inside = useMemo(() => [button, surface], []);
  useDismiss(open, inside, close);
  const placement = useAnchoredStyle(open, button, surface, "end");
  const body = button.current?.ownerDocument.body;
  const steps = guide.data?.steps;
  return (
    <>
      <Act
        ref={button}
        cta={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="What this project still needs before it can learn, and the next step"
        onClick={() => {
          if (!open) {
            void guide.refetch();
          }
          setOpen(!open);
        }}
        className={buttonClass("ghost", "rounded-full")}
      >
        {label}
      </Act>
      {open && body
        ? createPortal(
            <div
              ref={surface}
              role="dialog"
              aria-label="Getting started"
              style={placement}
              className="fixed z-50 flex w-90 flex-col gap-3 rounded-[18px] border border-line-strong bg-panel p-4 text-fg shadow-popover"
            >
              <div className="flex items-center">
                <span className="font-semibold">Getting started</span>
                {guide.data ? (
                  <span className="ml-auto text-ui text-fg-tertiary">
                    {guide.data.done} of {guide.data.total}
                  </span>
                ) : null}
              </div>
              {steps ? (
                <GuideChecklist steps={steps} project={project} onAct={close} />
              ) : (
                <span className="text-ui text-fg-tertiary">
                  {guide.isError ? "The checklist could not be loaded." : "Loading the checklist…"}
                </span>
              )}
            </div>,
            body,
          )
        : null}
    </>
  );
}
