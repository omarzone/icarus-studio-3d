// POP-CHAT-CONTEXT
import { ChevronRight, Layers } from "lucide-react";
import { useState } from "react";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import {
  compactionNote,
  contextSegments,
  contextTone,
  PART_LABEL,
  tokens,
  usedPercent,
  windowNote,
} from "../../ports/context-usage-views.ts";
import type { ContextCategoryView, ContextPart, ContextUsageView } from "../../ports/copilot-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";

// One grey step per part, in the order the engine sends them; the answer's reserve and the free room come last.
export const SHADE: Record<ContextPart | "reserve" | "free", string> = {
  system: "bg-fg",
  tools: "bg-fg opacity-85",
  skills: "bg-fg opacity-70",
  memory: "bg-fg opacity-60",
  project: "bg-fg opacity-50",
  summary: "bg-fg opacity-40",
  history: "bg-fg opacity-30",
  message: "bg-fg opacity-25",
  attachments: "bg-fg opacity-20",
  reserve: "bg-fill-track-off",
  free: "bg-control-raised",
};

const TONE_TEXT = { main: "text-fg-secondary", warn: "text-warn", danger: "text-danger" } as const;

const percentOf = (count: number, window: number) => {
  const share = (count / window) * 100;
  return share > 0 && share < 1 ? "<1%" : `${Math.round(share)}%`;
};

export type ContextState =
  | { status: "loading" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "ready"; usage: ContextUsageView };

// The breakdown behind the composer's gauge: what the next message sends to the model, piece by piece.
export function ContextBreakdown({ state }: { state: ContextState }) {
  switch (state.status) {
    case "loading":
      return (
        <div role="status" aria-label="Counting the context" className="flex flex-col gap-3">
          <span className="h-4 w-40 animate-pulse rounded-bar bg-control-raised" />
          <span className="h-2 w-full animate-pulse rounded-bar bg-control-raised" />
          <span className="h-24 w-full animate-pulse rounded-card-sm bg-control" />
        </div>
      );
    case "error":
      return (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-body font-semibold">The context could not be counted</p>
          <p className="text-ui text-fg-secondary">Nothing was sent to the model. Try again in a moment.</p>
          <p className="font-mono text-meta text-fg-tertiary">{state.message}</p>
          <Act cta="Try again" onClick={state.retry} className={buttonClass("secondary")}>
            Try again
          </Act>
        </div>
      );
    case "ready":
      return <Breakdown usage={state.usage} />;
  }
}

function Breakdown({ usage }: { usage: ContextUsageView }) {
  const tone = contextTone(usage);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-body font-semibold">Context</h2>
        <span className={`text-ui tabular-nums ${TONE_TEXT[tone]}`}>
          {tokens(usage.used)} / {tokens(usage.window)} tokens · {usedPercent(usage)}%
        </span>
      </div>
      {usage.model === null ? (
        <div className="flex items-center justify-between gap-2 rounded-card-sm bg-control px-3 py-2">
          <span className="text-ui text-fg-secondary">No model is connected yet</span>
          <GoTo to="SCR-SETTINGS-MODELS" cta="Open AI models" className={buttonClass("ghost", "h-7! px-2!")}>
            Open AI models
          </GoTo>
        </div>
      ) : (
        <p className="text-meta text-fg-tertiary">
          {usage.model} · {windowNote(usage)}
        </p>
      )}
      <StackedBar usage={usage} />
      <ul
        aria-label="Context breakdown"
        className="-mx-1.5 flex max-h-72 flex-col overflow-y-auto [scrollbar-color:var(--ic-fill-track-off)_transparent] [scrollbar-width:thin]"
      >
        {usage.categories.map((category) => (
          <CategoryRow key={category.part} category={category} window={usage.window} />
        ))}
        <PlainRow shade={SHADE.reserve} label="Reserved for the answer" count={usage.reserve} window={usage.window} />
        <PlainRow shade={SHADE.free} label="Free" count={usage.free} window={usage.window} />
      </ul>
      <p className="flex items-start gap-2 text-ui text-fg-secondary">
        <Layers size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-fg-tertiary" />
        {compactionNote(usage)}
      </p>
      <p className="text-meta text-fg-tertiary">
        Estimated before sending, the way the copilot budgets it: about four characters per token and 1.5k per picture.
      </p>
    </div>
  );
}

function StackedBar({ usage }: { usage: ContextUsageView }) {
  const segments = contextSegments(usage);
  return (
    <div
      role="img"
      aria-label={`${usedPercent(usage)}% of the context window used`}
      className="flex h-2 w-full gap-px overflow-hidden rounded-bar"
    >
      {segments.map((segment) =>
        segment.share > 0 ? (
          <span
            key={segment.key}
            className={`h-full ${SHADE[segment.key]}`}
            style={{ width: `${segment.share * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}

function Swatch({ shade }: { shade: string }) {
  return <span aria-hidden className={`size-2.5 shrink-0 rounded-bar ${shade}`} />;
}

function Amount({ count, window }: { count: number; window: number }) {
  return (
    <span className="ml-auto flex shrink-0 gap-2 tabular-nums">
      <span className="text-fg-secondary">{tokens(count)}</span>
      <span className="w-8 text-right text-fg-tertiary">{percentOf(count, window)}</span>
    </span>
  );
}

function PlainRow({ shade, label, count, window }: { shade: string; label: string; count: number; window: number }) {
  return (
    <li className="flex items-center gap-2 px-1.5 py-1.5 pl-6 text-ui">
      <Swatch shade={shade} />
      <span className="truncate">{label}</span>
      <Amount count={count} window={window} />
    </li>
  );
}

function CategoryRow({ category, window }: { category: ContextCategoryView; window: number }) {
  const [open, setOpen] = useState(false);
  const label = PART_LABEL[category.part];
  if (category.items.length === 0) {
    return <PlainRow shade={SHADE[category.part]} label={label} count={category.tokens} window={window} />;
  }
  // Two files may share a name, so repeated labels get a count in their key.
  const seen = new Map<string, number>();
  const items = [...category.items]
    .sort((a, b) => b.tokens - a.tokens)
    .map((item) => {
      const count = (seen.get(item.label) ?? 0) + 1;
      seen.set(item.label, count);
      return { ...item, key: count > 1 ? `${item.label} (${count})` : item.label };
    });
  return (
    <li className="flex flex-col">
      <Act
        cta={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-control px-1.5 py-1.5 text-left text-ui hover:bg-fill-hover active:opacity-80"
      >
        <ChevronRight
          size={12}
          strokeWidth={1.75}
          aria-hidden
          className={`shrink-0 text-fg-tertiary transition-transform ${open ? "rotate-90" : ""}`}
        />
        <Swatch shade={SHADE[category.part]} />
        <span className="truncate">{label}</span>
        <span className="text-meta text-fg-tertiary">{items.length}</span>
        <Amount count={category.tokens} window={window} />
      </Act>
      {open ? (
        <ul aria-label={label} className="mb-1 ml-10 flex flex-col border-l border-line-subtle pl-2.5">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-2 py-0.5 text-meta">
              <span className="min-w-0 truncate text-fg-secondary" title={item.label}>
                {item.label}
              </span>
              <span className="ml-auto shrink-0 tabular-nums text-fg-tertiary">{tokens(item.tokens)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
