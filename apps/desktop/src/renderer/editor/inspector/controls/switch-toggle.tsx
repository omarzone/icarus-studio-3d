import { Act } from "../../../app/navigation/go-to.tsx";

// Switch from the style guide: 34 × 20, green when on, white knob.
export function SwitchToggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <Act
      cta={label}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`relative h-5 w-8.5 shrink-0 rounded-full hover:opacity-90 ${on ? "bg-ok" : "bg-fill-track-off"}`}
    >
      <span className={`absolute top-0.5 size-4 rounded-full bg-white ${on ? "right-0.5" : "left-0.5"}`} />
    </Act>
  );
}
