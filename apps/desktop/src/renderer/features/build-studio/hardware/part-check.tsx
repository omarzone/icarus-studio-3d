import type { HardwareCheckStatus, HardwareSession } from "../../../ports/build-port.ts";
import { type PillTone, StatusPill } from "../../../ui/status-pill.tsx";

const TONE: Readonly<Record<HardwareCheckStatus, PillTone>> = {
  pass: "ok",
  warn: "warn",
  fail: "danger",
  skipped: "neutral",
};

const BAR: Readonly<Record<HardwareCheckStatus, string>> = {
  pass: "bg-selected",
  warn: "bg-warn",
  fail: "bg-danger",
  skipped: "bg-fill-hover",
};

// Every joint and sensor of the body against the kit's part for it: how much of its rating it uses and the verdict.
export function PartCheck({ check }: { check: HardwareSession["check"] }) {
  return (
    <section className="flex min-h-0 flex-col gap-3 rounded-[18px] bg-control p-4">
      <h2 className="leading-4 font-semibold">Check joints and sensors</h2>
      <p className="text-ui leading-[15px] text-fg-secondary">{check.instructions}</p>
      <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto">
        {check.rows.map((row) => (
          <div
            key={row.id}
            title={`${row.hardware ?? "No part in this kit"}: ${row.gap}`}
            className="grid grid-cols-[110px_minmax(0,1fr)_110px_60px] items-center gap-2.5 text-ui"
          >
            <span className="truncate">{row.name}</span>
            <span className="h-1.5 rounded-bar bg-control-raised">
              <span
                className={`block h-1.5 rounded-bar ${BAR[row.status]}`}
                style={{ width: `${Math.round(row.fraction * 100)}%` }}
              />
            </span>
            <span className="truncate font-mono">{row.reading}</span>
            <StatusPill tone={TONE[row.status]}>{row.status}</StatusPill>
          </div>
        ))}
      </div>
    </section>
  );
}
