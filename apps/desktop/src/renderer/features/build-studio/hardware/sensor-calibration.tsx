import type { HardwareSession } from "../../../ports/build-port.ts";
import { StatusPill } from "../../../ui/status-pill.tsx";

// Live readings from the device, each with its distance bar and whether it looks right.
export function SensorCalibration({ calibration }: { calibration: HardwareSession["calibration"] }) {
  return (
    <section className="flex flex-col gap-3 rounded-[18px] bg-control p-4">
      <h2 className="leading-4 font-semibold">Calibrate sensors</h2>
      <p className="text-ui leading-[15px] text-fg-secondary">{calibration.instructions}</p>
      {calibration.readings.map((reading) => (
        <div key={reading.name} className="grid grid-cols-[90px_minmax(0,1fr)_70px_60px] items-center gap-2.5 text-ui">
          <span>{reading.name}</span>
          <span className="h-1.5 rounded-bar bg-control-raised">
            <span
              className="block h-1.5 rounded-bar bg-selected"
              style={{ width: `${Math.round(reading.fraction * 100)}%` }}
            />
          </span>
          <span className="font-mono">{reading.meters === null ? "no data" : `${reading.meters.toFixed(2)} m`}</span>
          <StatusPill tone={reading.ok ? "ok" : "warn"}>{reading.ok ? "ok" : "check"}</StatusPill>
        </div>
      ))}
    </section>
  );
}
