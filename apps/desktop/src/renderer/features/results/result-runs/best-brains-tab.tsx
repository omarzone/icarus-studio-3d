// TAB-BEST-BRAINS
import { GoTo } from "../../../app/navigation/go-to.tsx";
import type { BestBrain } from "../../../ports/results-port.ts";

// The best checkpoint of each run, ready to use or export.
export function BestBrainsTab({ brains }: { brains: readonly BestBrain[] }) {
  return (
    <div className="flex flex-col gap-0.5 p-1.5">
      {brains.map((brain) => (
        <GoTo
          key={brain.id}
          to="SCR-BUILD"
          cta={`Use ${brain.run} brain`}
          title="Use this brain"
          className="flex items-center gap-2.5 rounded-button px-2.5 py-2.25 text-left hover:bg-fill-hover"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold">{brain.run}</span>
            <span className="text-meta text-fg-tertiary">checkpoint {brain.checkpoint}</span>
          </span>
          <span className="font-mono text-ui">{brain.score}</span>
        </GoTo>
      ))}
    </div>
  );
}
