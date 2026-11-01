// MOD-STOP-RUN
import { useQuery } from "@tanstack/react-query";
import { CloseOverlay, GoTo } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { trainingPort } from "../../ports/training-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { Dialog } from "../../ui/dialog.tsx";
import { ProjectDialogGate } from "../../ui/project-dialog-gate.tsx";
import { useOpenProjectId } from "../../ui/project-name.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { CheckList } from "../copilot/chat-messages.tsx";
import { TRAIN_CONFIG } from "./train-variants.ts";
import { trainingKeys, useRunsCache } from "./use-training.ts";

const DIALOG_BUTTON = "h-8.5! px-4! text-body!";

// Stop or pause a run without losing anything: where it is, its best result and what is kept.
export function StopRunDialog() {
  return (
    <ProjectDialogGate projectKey={useOpenProjectId(TRAIN_CONFIG.project)} title="Stop run">
      {(project) => <StopRun project={project} />}
    </ProjectDialogGate>
  );
}

function StopRun({ project }: { project: string }) {
  const port = usePort(trainingPort);
  const summary = useQuery({ queryKey: trainingKeys.stop(project), queryFn: () => port.getStopSummary(project) });
  const pause = useEngineAction(port.pauseRun);
  const stop = useEngineAction(port.stopRun);
  const runsCache = useRunsCache(project);
  const run = summary.data?.run ?? "this run";
  return (
    <Dialog
      title={`Stop ${run}?`}
      footer={
        <>
          <CloseOverlay cta="Keep training" className={buttonClass("secondary", DIALOG_BUTTON)}>
            Keep training
          </CloseOverlay>
          <CloseOverlay
            cta="Pause"
            onClick={() => void pause.mutateAsync(project).then(runsCache, () => undefined)}
            className={buttonClass("secondary", DIALOG_BUTTON)}
          >
            Pause
          </CloseOverlay>
          <GoTo
            to="SCR-RESULTS"
            cta={`Stop ${run}`}
            onClick={() => void stop.mutateAsync(project).then(runsCache, () => undefined)}
            className={buttonClass("primary", DIALOG_BUTTON)}
          >
            Stop {run}
          </GoTo>
        </>
      }
    >
      <QueryView query={summary}>
        {(data) => (
          <>
            <p className="leading-normal text-fg-secondary">{data.intro}</p>
            <div className="flex flex-col gap-2">
              <CheckList items={data.keeps.map((text) => ({ text, tone: "ok" as const }))} />
            </div>
          </>
        )}
      </QueryView>
    </Dialog>
  );
}
