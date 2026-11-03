// TAB-REFERENCE-TEST
import { tokens } from "@icarus/ui-tokens";
import type { ReferenceComparison } from "../../../ports/results-port.ts";

// Two brains' behavior side by side: the paths their bodies took from the same starts, on one scale.
export function ReferenceTestTab({ comparison }: { comparison: ReferenceComparison }) {
  return (
    <div className="flex h-full gap-2 p-2">
      {comparison.sides.map((side) => (
        <div key={side.id} className="relative min-w-0 flex-1 rounded-card-sm bg-app p-2.5">
          <div className="absolute top-3 left-3 flex flex-col">
            <span className="font-semibold">{side.title}</span>
            <span className="text-meta text-fg-tertiary">{side.detail}</span>
          </div>
          <svg role="img" aria-label={`${side.title}: paths`} viewBox="0 0 100 100" className="h-full w-full">
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
            {side.paths.map((path, index) => {
              const start = path[0];
              return start ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: starts keep their path order.
                <circle key={index} cx={start[0]} cy={start[1]} r="1.1" fill={tokens.viz.networkWire} />
              ) : null;
            })}
          </svg>
        </div>
      ))}
    </div>
  );
}
