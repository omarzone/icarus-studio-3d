// MOD-MOTION-TRACKING
import { useQuery } from "@tanstack/react-query";
import { GoTo } from "../../app/navigation/go-to.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { motionPort } from "../../ports/motion-port.ts";
import { Dialog } from "../../ui/dialog.tsx";
import { dialogButtonClass } from "../../ui/dialog-button.ts";
import { ProgressBar, ProgressSteps } from "../../ui/progress-steps.tsx";
import { ProjectDialogGate } from "../../ui/project-dialog-gate.tsx";
import { useProjectKey } from "../../ui/project-name.ts";
import { QueryView } from "../../ui/query-view.tsx";

// Sample clip of the gallery and prototype; the app uses the open project's.
const CLIP = "dance-copy";
const POLL_MS = 700;

// Pose tracking progress, honestly: the frame being tracked, the steps and which one runs now.
export function TrackingDialog() {
  return (
    <ProjectDialogGate projectKey={useProjectKey(CLIP)} title="Tracking the motion">
      {(clip) => <Tracking clip={clip} />}
    </ProjectDialogGate>
  );
}

function Tracking({ clip }: { clip: string }) {
  const port = usePort(motionPort);
  const query = useQuery({
    queryKey: ["motion", clip, "tracking"],
    queryFn: () => port.getTracking(clip),
    refetchInterval: (current) => (current.state.data?.state === "running" ? POLL_MS : false),
  });
  return (
    <Dialog
      title={query.data ? `Tracking ${query.data.file}` : "Tracking the motion"}
      width="w-130"
      closeTo="SCR-MOTION"
      footer={
        <>
          <GoTo to="SCR-MOTION" cta="Run in background" className={dialogButtonClass("secondary")}>
            Run in background
          </GoTo>
          <GoTo to="SCR-MOTION" cta="See result" className={dialogButtonClass("primary")}>
            See result
          </GoTo>
        </>
      }
    >
      <QueryView query={query}>
        {(tracking) => (
          <>
            <div
              role="img"
              aria-label="Video frame with the tracked skeleton"
              className="relative h-55 rounded-[14px] bg-app"
            >
              <span className="absolute bottom-2.5 left-2.5 rounded-button bg-overlay px-2.5 py-1.25 font-mono text-mono">
                {tracking.frame}
              </span>
            </div>
            <ProgressBar percent={tracking.percent} label="Tracking progress" />
            <ProgressSteps steps={tracking.steps} />
            {tracking.message ? (
              <p role="alert" className="text-ui text-warn">
                {tracking.state === "stopped" ? "Stopped" : "Tracking failed"}: {tracking.message}
              </p>
            ) : null}
          </>
        )}
      </QueryView>
    </Dialog>
  );
}
