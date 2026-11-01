// How much of something: main values white, minor ones dimmer, meaning colors for good, attention and bad.
export type MeterTone = "main" | "minor" | "ok" | "warn" | "danger";

const FILL: Record<MeterTone, string> = {
  main: "bg-fg",
  minor: "bg-fg-secondary",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger-graphic",
};

type Props = {
  // Share of the track filled, from 0 to 1.
  ratio: number;
  tone?: MeterTone;
  label?: string;
  className?: string;
};

// Bar from the style guide: 6 px, radius 3, track bg.control-raised.
export function Meter({ ratio, tone = "main", label, className = "" }: Props) {
  const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return (
    <span
      role="img"
      aria-label={label ? `${label}: ${percent}%` : `${percent}%`}
      className={`block h-1.5 rounded-bar bg-control-raised ${className}`}
    >
      <span className={`block h-1.5 rounded-bar ${FILL[tone]}`} style={{ width: `${percent}%` }} />
    </span>
  );
}
