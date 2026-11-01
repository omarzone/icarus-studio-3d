import { useEffect, useState } from "react";

export type ControlTone = "default" | "proposed" | "danger";

export const toneText: Record<ControlTone, string> = {
  default: "text-fg",
  proposed: "text-proposal",
  danger: "text-danger-graphic",
};

export const fieldClass =
  "h-6.5 rounded-control bg-control text-meta outline-none hover:bg-control-raised focus:bg-control-raised";

// The default box of a value field; pass another box through className to replace it.
export const fieldBox = `${fieldClass} px-2`;

type Props = {
  value: string;
  // Returns false when the text is not a valid value, which restores the last one.
  onCommit: (text: string) => boolean;
  label: string;
  tone?: ControlTone;
  mono?: boolean;
  placeholder?: string;
  className?: string;
};

// A text field that keeps what you type and commits it on Enter or when it loses focus.
export function ValueField({
  value,
  onCommit,
  label,
  tone = "default",
  mono = true,
  placeholder,
  className = fieldBox,
}: Props) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value && !onCommit(draft)) {
      setDraft(value);
    }
  };
  return (
    <input
      type="text"
      aria-label={label}
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit();
        }
        if (event.key === "Escape") {
          setDraft(value);
        }
      }}
      className={`min-w-0 outline-none placeholder:text-fg-tertiary ${mono ? "font-mono" : ""} ${toneText[tone]} ${className}`}
    />
  );
}

export function parseNumber(text: string): number | null {
  const match = text.replace(",", ".").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}
