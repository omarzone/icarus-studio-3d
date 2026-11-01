import { Check, type LucideIcon } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Act } from "../app/navigation/go-to.tsx";
import { useAnchoredStyle } from "./anchored.ts";
import { useDismiss } from "./dismiss.ts";

export type MenuEntry =
  | { label: string; hint?: string; icon?: LucideIcon; checked?: boolean; run: () => void }
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
  const hasChecks = entries.some((entry) => "checked" in entry && entry.checked !== undefined);
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
      {open && body
        ? createPortal(
            <div
              ref={menu}
              role="menu"
              aria-label={label}
              style={placement}
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
                    onClick={() => {
                      setOpen(false);
                      entry.run();
                    }}
                    className="flex w-full items-start gap-2.5 rounded-control px-2.5 py-2 text-left hover:bg-fill-hover"
                  >
                    {hasChecks ? (
                      <span className="mt-0.5 grid size-3.5 shrink-0 place-items-center">
                        {entry.checked ? <Check size={13} strokeWidth={2} aria-hidden /> : null}
                      </span>
                    ) : null}
                    {entry.icon ? (
                      <entry.icon
                        size={14}
                        strokeWidth={1.75}
                        className="mt-0.5 shrink-0 text-fg-secondary"
                        aria-hidden
                      />
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
          )
        : null}
    </>
  );
}
