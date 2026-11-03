import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Act } from "../../app/navigation/go-to.tsx";
import { contextTone, tokens, usedPercent } from "../../ports/context-usage-views.ts";
import { useAnchoredStyle } from "../../ui/anchored.ts";
import { useDismiss } from "../../ui/dismiss.ts";
import { ContextBreakdown, type ContextState } from "./context-popover.tsx";

const ARC = { main: "stroke-fg-secondary", warn: "stroke-warn", danger: "stroke-danger-graphic" } as const;

function summary(state: ContextState): string {
  switch (state.status) {
    case "loading":
      return "Counting the context…";
    case "error":
      return "The context could not be counted";
    case "ready":
      return `Context: ${usedPercent(state.usage)}% used, ${tokens(state.usage.used)} of ${tokens(state.usage.window)} tokens`;
  }
}

// A small ring that fills as the next message's context fills the model's window.
function Ring({ state }: { state: ContextState }) {
  const percent = state.status === "ready" ? usedPercent(state.usage) : 0;
  const arc = state.status === "ready" ? ARC[contextTone(state.usage)] : ARC.main;
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={`size-4 -rotate-90 ${state.status === "loading" ? "animate-pulse" : ""}`}
    >
      <circle cx="8" cy="8" r="6" fill="none" strokeWidth="2" className="stroke-fill-track-off" />
      {percent > 0 ? (
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          strokeWidth="2"
          pathLength={100}
          strokeDasharray={`${Math.max(percent, 2)} 100`}
          className={arc}
        />
      ) : null}
    </svg>
  );
}

type Props = {
  state: ContextState;
  // Opening asks for a fresh count.
  onOpen?: () => void;
};

// The composer's context gauge; clicking it opens the breakdown (POP-CHAT-CONTEXT) above it.
export function ContextMeter({ state, onOpen }: Props) {
  const button = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const inside = useMemo(() => [button, surface], []);
  useDismiss(open, inside, close);
  const placement = useAnchoredStyle(open, button, surface, "end");
  const body = button.current?.ownerDocument.body;
  const label = summary(state);
  return (
    <>
      <Act
        ref={button}
        cta="Context usage"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
        onClick={() => {
          if (!open) {
            onOpen?.();
          }
          setOpen((value) => !value);
        }}
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-full px-1.5 text-meta tabular-nums text-fg-tertiary hover:bg-fill-hover hover:text-fg active:opacity-80"
      >
        {state.status === "ready" ? <span>{usedPercent(state.usage)}%</span> : null}
        <Ring state={state} />
      </Act>
      {open && body
        ? createPortal(
            <div
              ref={surface}
              role="dialog"
              aria-label="Context usage"
              style={placement}
              className="fixed z-50 w-88 rounded-[18px] border border-line-strong bg-panel p-4 text-fg shadow-popover"
            >
              <ContextBreakdown state={state} />
            </div>,
            body,
          )
        : null}
    </>
  );
}
