import { useEffect, useRef, useState } from "react";
import { shownSteps } from "../../ports/live-progress.ts";
import type { LiveProgress } from "../../ports/training-port.ts";
import { compactNumber } from "../../ui/compact-number.ts";
import { ProgressBar } from "../../ui/progress-steps.tsx";

const REDRAW_MS = 100;

// What the run is doing right now and how far it is, so a live view always shows it training, even while the
// copies wait for a brain update or a checkpoint test.
export function RunProgress({ copies, progress }: { copies: number; progress: LiveProgress }) {
  const steps = useShownSteps(progress);
  const percent = progress.total > 0 ? Math.round((steps / progress.total) * 1000) / 10 : 0;
  return (
    <div role="status" className="flex w-64 flex-col gap-1.5 rounded-card-sm bg-overlay px-3 py-2 text-meta">
      <span className="flex items-center justify-between gap-2">
        <span className="font-semibold">{progress.phase ?? "Training"}</span>
        <span className="font-mono">
          {copies} {copies === 1 ? "copy" : "copies"}
        </span>
      </span>
      <ProgressBar percent={percent} label="Training progress" />
      <span className="font-mono">
        {compactNumber(Math.floor(steps))} of {compactNumber(progress.total)} steps
      </span>
    </div>
  );
}

// The step the bar shows, moved on between reports at the measured speed.
function useShownSteps(progress: LiveProgress): number {
  const shown = useRef(progress.step);
  const [steps, setSteps] = useState(progress.step);
  useEffect(() => {
    const redraw = () => {
      shown.current = shownSteps(progress, performance.now(), shown.current);
      setSteps(shown.current);
    };
    redraw();
    if (!progress.advancing) {
      return;
    }
    const timer = window.setInterval(redraw, REDRAW_MS);
    return () => window.clearInterval(timer);
  }, [progress]);
  return steps;
}
