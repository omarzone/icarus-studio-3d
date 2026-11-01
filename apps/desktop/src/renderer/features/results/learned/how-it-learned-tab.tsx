// TAB-HOW-IT-LEARNED
import { GoTo } from "../../../app/navigation/go-to.tsx";
import type { Checkpoint } from "../../../ports/results-port.ts";

// Checkpoint cards with their thumbnail and score; future checkpoints are greyed with an estimate.
export function HowItLearnedTab({ checkpoints }: { checkpoints: readonly Checkpoint[] }) {
  return (
    <div
      className="grid h-full gap-2 px-3 pt-2.5 pb-3"
      style={{ gridTemplateColumns: `repeat(${checkpoints.length}, minmax(0, 1fr))` }}
    >
      {checkpoints.map((checkpoint) =>
        checkpoint.reached ? (
          <GoTo
            key={checkpoint.id}
            to="SCR-TIMELAPSE"
            cta={`${checkpoint.step}\n${checkpoint.label}`}
            title="Open the timelapse at this checkpoint"
            className={`flex min-h-0 flex-col overflow-hidden rounded-card-sm text-left ${
              checkpoint.current ? "bg-control-raised hover:bg-fill-hover" : "bg-control hover:bg-control-raised"
            }`}
          >
            <span role="img" aria-label={`Checkpoint ${checkpoint.step}`} className="min-h-0 w-full flex-1 bg-panel" />
            <span className="flex justify-between px-2.25 py-1.75 text-meta">
              <span className={checkpoint.current ? "font-semibold" : "font-medium"}>{checkpoint.step}</span>
              <span className={checkpoint.current ? "" : "text-fg-tertiary"}>{checkpoint.label}</span>
            </span>
          </GoTo>
        ) : (
          <div
            key={checkpoint.id}
            className="flex flex-col items-center justify-center gap-1 rounded-card-sm bg-control text-meta text-fg-tertiary opacity-60"
          >
            <span className="font-medium">{checkpoint.step}</span>
            <span>{checkpoint.eta}</span>
          </div>
        ),
      )}
    </div>
  );
}
