import { Check, ChevronDown } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Act } from "../app/navigation/go-to.tsx";
import { useAnchoredStyle } from "./anchored.ts";
import { useDismiss } from "./dismiss.ts";

export type SelectOption = {
  value: string;
  label: string;
  // Icon or swatch drawn before the label, in the field and in the list.
  leading?: ReactNode;
};

type Props = {
  // Accessible name of the field, also its `data-cta`.
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  // Size, surface and text classes of the closed field.
  className?: string;
};

// A select drawn like the style guide's menus; the native one is painted by the system and ignores the design.
export function Select({ label, value, options, onChange, className = "" }: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const current = options.find((option) => option.value === value);
  const close = useCallback(() => setOpen(false), []);
  const inside = useMemo(() => [trigger, list], []);
  useDismiss(open, inside, close);
  const placement = useAnchoredStyle(open, trigger, list, "start");

  const show = () => {
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    );
    setOpen(true);
  };
  const pick = (option: SelectOption | undefined) => {
    if (option) {
      onChange(option.value);
    }
    setOpen(false);
    trigger.current?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        show();
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (index + step + options.length) % options.length);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick(options[active]);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <>
      <Act
        ref={trigger}
        cta={label}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={`flex min-w-0 items-center gap-2 text-left ${className}`}
      >
        {current?.leading}
        <span className="min-w-0 flex-1 truncate">{current?.label ?? ""}</span>
        <ChevronDown
          size={12}
          strokeWidth={1.75}
          className={`shrink-0 text-fg-tertiary transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </Act>
      {open
        ? createPortal(
            <div
              ref={list}
              role="listbox"
              aria-label={label}
              style={placement}
              className="fixed z-50 max-h-70 overflow-auto rounded-card-sm border border-line-strong bg-panel p-1 text-fg shadow-menu"
            >
              {options.map((option, index) => {
                const selected = option.value === value;
                return (
                  <Act
                    key={option.value}
                    cta={option.label}
                    role="option"
                    aria-selected={selected}
                    onPointerEnter={() => setActive(index)}
                    onClick={() => pick(option)}
                    className={`flex h-8 w-full items-center gap-2 rounded-control px-2.5 text-left text-meta ${
                      index === active ? "bg-fill-hover" : ""
                    } ${selected ? "font-medium text-fg" : "text-fg-secondary"}`}
                  >
                    {option.leading}
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {selected ? (
                      <Check size={13} strokeWidth={2} className="shrink-0 text-fg" aria-hidden />
                    ) : (
                      <span className="size-3.25 shrink-0" />
                    )}
                  </Act>
                );
              })}
            </div>,
            trigger.current?.ownerDocument.body ?? document.body,
          )
        : null}
    </>
  );
}
