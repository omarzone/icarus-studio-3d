import type { InputHTMLAttributes, ReactNode } from "react";
import type { ScreenId } from "../../app/navigation/catalog-id.ts";
import { Act } from "../../app/navigation/go-to.tsx";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { type ButtonVariant, buttonClass } from "../../ui/button-styles.ts";

// Dialog buttons are 34 px with 13 px labels (style guide: Buttons).
export function dialogButtonClass(variant: ButtonVariant, extra = ""): string {
  return buttonClass(variant, `h-8.5! px-4! text-body! ${extra}`);
}

export const fieldClass =
  "h-10 w-full rounded-button bg-control px-3 text-body text-fg outline-none placeholder:text-fg-tertiary hover:bg-control-raised focus:bg-control-raised";

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & { label: string; mono?: boolean };

export function TextField({ label, mono = false, ...rest }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-ui text-fg-secondary">{label}</span>
      <input className={`${fieldClass} ${mono ? "font-mono text-ui" : ""}`} {...rest} />
    </label>
  );
}

type SwitchProps = {
  label: ReactNode;
  cta: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  title?: string;
};

// Switch from the style guide: 34 × 20, on is `ok`, off is the track color, white knob.
export function SwitchRow({ label, cta, checked, onChange, disabled, title }: SwitchProps) {
  return (
    <Act
      cta={cta}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5 self-start rounded-control text-body hover:opacity-90 active:opacity-80 disabled:opacity-35"
    >
      <span
        className={`relative h-5 w-8.5 shrink-0 rounded-full transition-colors ${checked ? "bg-ok" : "bg-fill-track-off"}`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-fg transition-all ${checked ? "right-0.5" : "left-0.5"}`}
        />
      </span>
      {label}
    </Act>
  );
}

// A dialog button that runs a port action first and leaves only when it worked: back to the screen
// underneath, or to `to`. A pending action shows its notice and keeps the dialog open.
export function ActionButton({
  cta,
  to,
  run,
  variant,
  disabled,
  title,
  children,
}: {
  cta: string;
  to?: ScreenId;
  run: () => Promise<unknown>;
  variant: ButtonVariant;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}) {
  const screen = useNavigation((state) => state.screen);
  const go = useNavigation((state) => state.go);
  const close = useNavigation((state) => state.close);
  return (
    <Act
      cta={cta}
      data-goes-to={to ?? screen}
      disabled={disabled}
      title={title}
      onClick={() =>
        void run().then(
          () => (to ? go(to, {}) : close()),
          () => undefined,
        )
      }
      className={dialogButtonClass(variant)}
    >
      {children}
    </Act>
  );
}
