import { Apple, Hand, Radio, Scale, Sun, Utensils, Wind } from "lucide-react";
import type { BarTone, LiveBar, SenseIcon } from "../../ports/play-port.ts";
import { Meter, type MeterTone } from "../../ui/meter.tsx";

const ICONS = {
  smell: Apple,
  hunger: Utensils,
  light: Sun,
  antenna: Radio,
  touch: Hand,
  wind: Wind,
  balance: Scale,
} as const satisfies Record<SenseIcon, unknown>;

const TONES: Record<BarTone, MeterTone> = { default: "main", ok: "ok", warn: "warn", danger: "danger" };

// Live values as rows of name, bar and value; rows with icons get a wider name column.
export function LiveBarList({ bars }: { bars: readonly LiveBar[] }) {
  const withIcons = bars.some((bar) => bar.icon);
  const columns = withIcons ? "grid-cols-[92px_minmax(0,1fr)_34px]" : "grid-cols-[64px_minmax(0,1fr)_44px]";
  return (
    <div className="flex flex-col gap-2.25">
      {bars.map((bar) => {
        const Icon = bar.icon ? ICONS[bar.icon] : null;
        return (
          <div key={bar.id} className={`grid items-center gap-2 text-meta ${columns}`}>
            <span className="flex min-w-0 items-center gap-1.5 truncate text-fg-secondary">
              {Icon ? <Icon size={12} strokeWidth={1.75} className="shrink-0" aria-hidden /> : null}
              {bar.label}
            </span>
            <Meter ratio={bar.ratio} tone={TONES[bar.tone]} label={bar.label} />
            <span className="text-right font-mono">{bar.display}</span>
          </div>
        );
      })}
    </div>
  );
}
