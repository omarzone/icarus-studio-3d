// MOD-AUTO-RIG
import { useQuery } from "@tanstack/react-query";
import { CloseOverlay, GoTo } from "../../app/navigation/go-to.tsx";
import { NotAvailableYet } from "../../app/runtime/pending.ts";
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
  const query = useQuery({ queryKey: ["body", body, "auto-rig"], queryFn: () => port.getAutoRig(body) });
  // With no auto-rig behind it there is nothing to cancel or see, so the only way on is Close.
  const notYet = query.error instanceof NotAvailableYet;
  return (
    <Dialog
      title={query.data ? `Auto-rigging ${query.data.file}` : "Auto-rigging"}
      footer={
        notYet ? (
          <CloseOverlay cta="Close" className={dialogButtonClass("primary")}>
            Close
          </CloseOverlay>
        ) : (
          <>
            <CloseOverlay cta="Run in background" className={dialogButtonClass("secondary")}>
              Run in background
            </CloseOverlay>
            <ActionButton cta="Cancel" run={() => port.cancelAutoRig(body)} className={dialogButtonClass("secondary")}>
              Cancel
            </ActionButton>
            <GoTo to="STA-BODY-CHECK-FAILED" cta="See result" className={dialogButtonClass("primary")}>
              See result
            </GoTo>
          </>
        )
      }
    >
      <QueryView query={query}>
        {(progress) => (
          <>
            <ProgressBar percent={progress.percent} label="Auto-rig progress" />
            <ProgressSteps steps={progress.steps} />
          </>
        )}
      </QueryView>
    </Dialog>
  );
}
