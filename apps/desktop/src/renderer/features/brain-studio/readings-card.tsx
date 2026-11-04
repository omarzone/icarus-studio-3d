import { useQuery } from "@tanstack/react-query";
import { usePort } from "../../app/runtime/port.tsx";
import { useLiveBrain } from "../../editor/brain-activity/use-live-brain.ts";
import { brainPort } from "../../ports/brain-port.ts";

// What the brain senses: live while its brain plays, otherwise a moment of a test try.
export function useReadings(brain: string, enabled = true) {
  const port = usePort(brainPort);
  useLiveBrain(brain);
  return useQuery({ queryKey: ["brain", brain, "readings"], queryFn: () => port.getReadings(brain), enabled });
}

// Live card over the view: what the brain senses (learned brains) or which neurons fire (connectome brains).
export function ReadingsCard({ brain }: { brain: string }) {
  const readings = useReadings(brain).data;
  if (!readings) {
    return null;
  }
  return (
    <div className="absolute top-21.5 right-4 flex w-64 flex-col gap-2 rounded-card bg-floating p-3.5">
      <span className="font-semibold">{readings.title}</span>
      {readings.rows.map((row) => (
        <div
          key={row.label}
          className="grid grid-cols-[minmax(70px,auto)_minmax(0,1fr)_44px] items-center gap-2 text-meta"
        >
          <span className="text-fg-secondary">{row.label}</span>
          <span className="h-1.5 rounded-bar bg-control-raised">
            <span
              className={`block h-1.5 rounded-bar ${row.hot ? "bg-danger-graphic" : "bg-fg"}`}
              style={{ width: `${row.ratio * 100}%` }}
            />
          </span>
          <span className="text-right font-mono">{row.value}</span>
        </div>
      ))}
      <span className="text-meta text-fg-tertiary">{readings.caption}</span>
    </div>
  );
}
