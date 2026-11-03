import { Check, type LucideIcon } from "lucide-react";
import { type CSSProperties, type ReactNode, type Ref, useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Act } from "../app/navigation/go-to.tsx";
import { useAnchoredStyle } from "./anchored.ts";
import { useDismiss } from "./dismiss.ts";

export type MenuEntry =
  // A `disabled` entry stays visible and dimmed, its hint saying why it cannot be picked.
  | { label: string; hint?: string; icon?: LucideIcon; checked?: boolean; disabled?: boolean; run: () => void }
  | { divider: true; key: string };

type Props = {
  // Accessible name and `data-cta` of the button that opens the menu.
  label: string;
  entries: readonly MenuEntry[];
  // What the button shows (an icon, or an icon and a word).
  children: ReactNode;
  className: string;
  align?: "start" | "end";
};

// A button that opens a menu from the style guide; it stays inside the window and closes on Escape or outside.
export function MenuButton({ label, entries, children, className, align = "end" }: Props) {
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const inside = useMemo(() => [button, menu], []);
  useDismiss(open, inside, close);
  const placement = useAnchoredStyle(open, button, menu, align);
  const body = button.current?.ownerDocument.body;
  return (
    <>
      <Act
        ref={button}
        cta={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((value) => !value)}
        className={className}
      >
        {children}
      </Act>
      {open && body ? (
        <MenuSurface ref={menu} label={label} entries={entries} style={placement} onPick={close} body={body} />
      ) : null}
    </>
  );
}

type SurfaceProps = {
  ref: Ref<HTMLDivElement>;
  label: string;
  entries: readonly MenuEntry[];
  style: CSSProperties;
  // Called before an entry runs, so the menu closes first.
  onPick: () => void;
  // Document body the menu is drawn into (popped-out panels have their own).
  body: HTMLElement;
};

// The floating list of a menu, placed by its opener (`useAnchoredStyle`) and closed by it (`useDismiss`).
export function MenuSurface({ ref, label, entries, style, onPick, body }: SurfaceProps) {
  const hasChecks = entries.some((entry) => "checked" in entry && entry.checked !== undefined);
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      style={style}
      className="fixed z-50 w-64 rounded-card border border-line-strong bg-panel p-1.5 text-fg shadow-menu"
    >
      {entries.map((entry) =>
        "divider" in entry ? (
          <hr key={entry.key} className="mx-2 my-1.5 h-px border-0 bg-line-subtle" />
        ) : (
          <Act
            key={entry.label}
            cta={entry.label}
            role={entry.checked === undefined ? "menuitem" : "menuitemcheckbox"}
            aria-checked={entry.checked}
            aria-disabled={entry.disabled || undefined}
            onClick={() => {
              if (entry.disabled) {
                return;
              }
              onPick();
              entry.run();
            }}
            className="flex w-full items-start gap-2.5 rounded-control px-2.5 py-2 text-left hover:bg-fill-hover aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-transparent"
          >
            {hasChecks ? (
              <span className="mt-0.5 grid size-3.5 shrink-0 place-items-center">
                {entry.checked ? <Check size={13} strokeWidth={2} aria-hidden /> : null}
              </span>
            ) : null}
            {entry.icon ? (
              <entry.icon size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-fg-secondary" aria-hidden />
            ) : null}
            <span className="flex flex-col gap-0.5">
              <span className="text-body font-medium">{entry.label}</span>
              {entry.hint ? <span className="text-ui text-fg-tertiary">{entry.hint}</span> : null}
            </span>
          </Act>
        ),
      )}
    </div>,
    body,
  );
}
