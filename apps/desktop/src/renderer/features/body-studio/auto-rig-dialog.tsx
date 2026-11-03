// MOD-AUTO-RIG
import { useQuery } from "@tanstack/react-query";
import { CloseOverlay, GoTo } from "../../app/navigation/go-to.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { bodyPort } from "../../ports/body-port.ts";
import { ActionButton } from "../../ui/action-button.tsx";
import { Dialog } from "../../ui/dialog.tsx";
import { dialogButtonClass } from "../../ui/dialog-button.ts";
import { ProgressBar, ProgressSteps } from "../../ui/progress-steps.tsx";
import { ProjectDialogGate } from "../../ui/project-dialog-gate.tsx";
import { useProjectKey } from "../../ui/project-name.ts";
import { QueryView } from "../../ui/query-view.tsx";

// Sample body of the gallery and prototype; the app uses the open project's.
const BODY = "dance-copy";
const POLL_MS = 500;

// Makes an imported model physical step by step, honestly showing which step runs now.
export function AutoRigDialog() {
  return (
    <ProjectDialogGate projectKey={useProjectKey(BODY)} title="Auto-rigging">
      {(body) => <AutoRig body={body} />}
    </ProjectDialogGate>
  );
}

function AutoRig({ body }: { body: string }) {
  const port = usePort(bodyPort);
  const query = useQuery({
    queryKey: ["body", body, "auto-rig"],
    queryFn: () => port.getAutoRig(body),
    refetchInterval: (current) => (current.state.data?.state === "running" ? POLL_MS : false),
  });
  const running = query.data?.state === "running";
  return (
    <Dialog
      title={query.data ? `Auto-rigging ${query.data.file}` : "Auto-rigging"}
      footer={
        <>
          <CloseOverlay cta="Run in background" className={dialogButtonClass("secondary")}>
            Run in background
          </CloseOverlay>
          <ActionButton
            cta="Cancel"
            run={() => port.cancelAutoRig(body)}
            disabled={!running}
            title={running ? undefined : "Nothing is running to cancel"}
            className={dialogButtonClass("secondary")}
          >
            Cancel
          </ActionButton>
          <GoTo to="STA-BODY-CHECK-FAILED" cta="See result" className={dialogButtonClass("primary")}>
            See result
          </GoTo>
        </>
      }
    >
      <QueryView query={query}>
        {(progress) => (
          <>
            <ProgressBar percent={progress.percent} label="Auto-rig progress" />
            <ProgressSteps steps={progress.steps} />
            {progress.message ? (
              <p role="alert" className="text-ui text-warn">
                {progress.state === "stopped" ? "Stopped" : "Did not finish"}: {progress.message}
              </p>
            ) : null}
          </>
        )}
      </QueryView>
    </Dialog>
  );
}
