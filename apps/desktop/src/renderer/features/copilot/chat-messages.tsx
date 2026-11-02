import { Check, ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import type { CheckItem, RichText } from "../../ports/copilot-port.ts";

export function RichTextView({ text }: { text: RichText }) {
  return (
    <span>
      {text.map((part, index) =>
        part.strong ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts of one sentence never reorder.
          <b key={index} className="font-semibold">
            {part.text}
          </b>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts of one sentence never reorder.
          <span key={index}>{part.text}</span>
        ),
      )}
    </span>
  );
}

// User bubble: right-aligned, white, radius 20 20 6 20, max 82%.
export function UserBubble({ text }: { text: string }) {
  return (
    <div className="max-w-[calc(82%+28px)] self-end rounded-[20px_20px_6px_20px] bg-selected px-3.5 py-2.5 text-body leading-[1.45] text-on-selected">
      {text}
    </div>
  );
}

type CopilotProps = {
  title?: string;
  text: RichText;
  checks?: readonly CheckItem[];
  // Inline actions drawn at the end of the bubble.
  actions?: ReactNode;
  // How the copilot thought about the answer, behind a toggle.
  thinking?: string;
};

// Copilot bubble: grey, no avatar; a sentence, then a check list when the answer is structured.
export function CopilotBubble({ title, text, checks, actions, thinking }: CopilotProps) {
  if (thinking) {
    return (
      <div className="flex max-w-[calc(92%+28px)] flex-col gap-2 rounded-bubble bg-control px-3.5 py-2.75 text-body leading-normal">
        <RichTextView text={text} />
        <ThinkingToggle thinking={thinking} />
      </div>
    );
  }
  if ((checks && checks.length > 0) || actions) {
    return (
      <div className="flex flex-col gap-2.5 rounded-bubble bg-control px-3.5 py-3 text-body leading-[1.55] [&>span]:leading-[1.55]">
        <RichTextView text={text} />
        {checks ? <CheckList items={checks} leading="leading-[1.55]" /> : null}
        {actions}
      </div>
    );
  }
  if (title) {
    return (
      <div className="rounded-bubble bg-control p-3.5 text-body leading-[1.55]">
        <span className="font-semibold">{title}</span>
        <br />
        <RichTextView text={text} />
      </div>
    );
  }
  return (
    <div className="max-w-[calc(92%+28px)] rounded-bubble bg-control px-3.5 py-2.75 text-body leading-normal">
      <RichTextView text={text} />
    </div>
  );
}

export function CheckList({ items, leading }: { items: readonly CheckItem[]; leading?: string }) {
  return (
    <>
      {items.map((item) => (
        <CheckLine key={item.text} item={item} leading={leading} />
      ))}
    </>
  );
}

// A fact with its meaning: green check when it works, amber "!" when it needs attention.
// Inside a copilot answer lines follow the bubble's 1.55 line height; elsewhere they stay tight.
export function CheckLine({ item, leading = "leading-tight" }: { item: CheckItem; leading?: string }) {
  return (
    <span className={`flex items-center gap-2.25 text-ui ${leading}`}>
      {item.tone === "ok" ? (
        <Check size={13} strokeWidth={1.75} className="shrink-0 text-ok" aria-label="Done" />
      ) : (
        <span role="img" aria-label="Needs attention" className="w-3.25 shrink-0 text-center font-bold text-warn">
          !
        </span>
      )}
      <span>{item.text}</span>
    </span>
  );
}

function ThinkingToggle({ thinking }: { thinking: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Act
        cta="Show thinking"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 self-start rounded-control px-1 py-0.5 text-ui text-fg-tertiary hover:bg-fill-hover hover:text-fg active:opacity-80"
      >
        {open ? "Hide thinking" : "Show thinking"}
        <ChevronDown size={12} strokeWidth={1.75} aria-hidden className={open ? "rotate-180" : ""} />
      </Act>
      {open ? <p className="text-ui leading-normal whitespace-pre-wrap text-fg-tertiary">{thinking}</p> : null}
    </>
  );
}

// While the copilot works on an answer.
export function ThinkingBubble() {
  return (
    <div role="status" className="self-start rounded-bubble bg-control px-3.5 py-2.75 text-body text-fg-tertiary">
      <span className="animate-pulse">Thinking…</span>
    </div>
  );
}
