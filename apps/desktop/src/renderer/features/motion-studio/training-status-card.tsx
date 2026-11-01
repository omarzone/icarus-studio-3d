import { useQuery } from "@tanstack/react-query";
import { GoTo } from "../../app/navigation/go-to.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { motionPort } from "../../ports/motion-port.ts";
import { ProgressBar } from "../../ui/progress-steps.tsx";

const pillClass =
  "inline-flex h-7.5 items-center rounded-full bg-fill-ghost px-3.5 text-ui hover:bg-control-raised active:opacity-80";

// Floating status while the copy trains: progress, time left, match before and now, and the hard moment.
export function TrainingStatusCard({ clip }: { clip: string }) {
  const port = usePort(motionPort);
  const query = useQuery({ queryKey: ["motion", clip, "training"], queryFn: () => port.getTrainingStatus(clip) });
  const status = query.data;
  if (!status) {
    return null;
  }
  return (
    <div
      role="status"
      className="absolute top-2.25 left-1/2 flex w-140 -translate-x-1/2 flex-col gap-2 rounded-card border border-line-divider bg-floating px-4 py-3 shadow-floating"
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="size-3.25 shrink-0 animate-spin rounded-full border-2 border-fg border-r-transparent"
        />
        <span className="font-semibold">{status.title}</span>
        <span className="ml-auto text-ui text-fg-secondary">{status.timeLeft}</span>
      </div>
      <ProgressBar percent={status.percent} label="Training progress" />
      <div className="flex items-center gap-4 text-ui">
        <span>
          Match <b className="font-semibold">{status.match}</b>
        </span>
        <span>
          {status.hardMoment} <b className="font-semibold text-ok">{status.hardResult}</b>
        </span>
        <span className="ml-auto flex gap-1.5">
          <GoTo to="SCR-MOTION" cta="Watch" className={pillClass}>
            Watch
          </GoTo>
          <GoTo to="MOD-EXPORT-ANIMATION" cta="Export now" className={pillClass}>
            Export now
          </GoTo>
        </span>
      </div>
    </div>
  );
}
