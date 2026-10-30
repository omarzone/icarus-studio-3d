import type { ReactNode } from "react";

export type PillTone = "ok" | "warn" | "danger" | "neutral";

const TONES: Record<PillTone, string> = {
  ok: "bg-ok-tint text-ok",
  warn: "bg-warn-tint text-warn",
  danger: "bg-danger-tint text-danger",
  neutral: "bg-fill-hover text-fg-tool",
};

// Status pill from the style guide: 26 px, meaning tint background and meaning text.
export function StatusPill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return (
    <span className={`inline-flex h-6.5 shrink-0 items-center gap-1 rounded-full px-2.5 text-ui ${TONES[tone]}`}>
      {children}
    </span>
  );
}
