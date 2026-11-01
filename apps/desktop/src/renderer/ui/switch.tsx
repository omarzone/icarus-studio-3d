import { Act } from "../app/navigation/go-to.tsx";

type Props = {
  // Label from the design inventory, also read by screen readers.
  label: string;
  checked: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onChange: (checked: boolean) => void;
};

// Switch from the style guide: 34 × 20, on is ok green, off is the track color, white knob.
export function Switch({ label, checked, disabled = false, disabledReason, onChange }: Props) {
  return (
    <Act
      cta={label}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-8.5 shrink-0 rounded-full hover:opacity-90 active:opacity-80 disabled:opacity-35 ${checked ? "bg-ok" : "bg-fill-track-off"}`}
    >
      <span
        className={`absolute top-0.5 size-4 rounded-full bg-white transition-[left] ${checked ? "left-4" : "left-0.5"}`}
      />
    </Act>
  );
}
