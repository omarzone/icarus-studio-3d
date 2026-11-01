// TAB-REFERENCE-TEST
import { tokens } from "@icarus/ui-tokens";
import type { ReferenceComparison } from "../../../ports/results-port.ts";

// Recorded and simulated behavior side by side: walking paths inside the same round arena.
export function ReferenceTestTab({ comparison }: { comparison: ReferenceComparison }) {
  return (
    <div className="flex h-full gap-2 p-2">
      {comparison.sides.map((side) => (
        <div key={side.id} className="relative min-w-0 flex-1 rounded-card-sm bg-app p-2.5">
          <div className="absolute top-3 left-3 flex flex-col">
            <span className="font-semibold">{side.title}</span>
            <span className="text-meta text-fg-tertiary">{side.detail}</span>
          </div>
          <svg role="img" aria-label={`${side.title}: walking paths`} viewBox="0 0 100 100" className="h-full w-full">
            <circle cx="50" cy="50" r="46" fill="none" stroke="var(--ic-line-dashed)" strokeWidth="0.6" />
            {side.paths.map((path, index) => (
              <polyline
                // biome-ignore lint/suspicious/noArrayIndexKey: paths keep their recording order.
                key={index}
                points={path.map(([x, y]) => `${x},${y}`).join(" ")}
                fill="none"
                stroke={tokens.viz.networkWire}
                strokeOpacity="0.8"
                strokeWidth="0.7"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        </div>
      ))}
    </div>
  );
}
