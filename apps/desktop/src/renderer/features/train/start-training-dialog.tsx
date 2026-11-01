// MOD-START-TRAINING
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useState } from "react";
import { CloseOverlay, GoTo } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type StartPlan, trainingPort } from "../../ports/training-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { Dialog } from "../../ui/dialog.tsx";
import { ProjectDialogGate } from "../../ui/project-dialog-gate.tsx";
import { useOpenProjectId } from "../../ui/project-name.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { Switch } from "../../ui/switch.tsx";
import { TextField } from "../../ui/text-field.tsx";
import { TRAIN_CONFIG } from "./train-variants.ts";
import { trainingKeys, useRunsCache } from "./use-training.ts";

const DIALOG_BUTTON = "h-8.5! px-4! text-body!";

// Confirms a training run with a clear cost: steps, parallel copies, estimated time and threads.
export function StartTrainingDialog() {
  return (
    <ProjectDialogGate projectKey={useOpenProjectId(TRAIN_CONFIG.project)} title="Start training">
      {(project) => <StartTraining project={project} />}
    </ProjectDialogGate>
  );
}

function StartTraining({ project }: { project: string }) {
  const port = usePort(trainingPort);
  const client = useQueryClient();
  const plan = useQuery({ queryKey: trainingKeys.plan(project), queryFn: () => port.getStartPlan(project) });
  const update = useEngineAction(port.updateStartPlan);
  const start = useEngineAction(port.startRun);
  const runsCache = useRunsCache(project);
  const save = (next: StartPlan) => client.setQueryData(trainingKeys.plan(project), next);
  const run = plan.data?.run ?? "run";
  return (
    <Dialog
      title="Start training"
      width="w-135"
      footer={
        <>
          <CloseOverlay cta="Cancel" className={buttonClass("secondary", DIALOG_BUTTON)}>
            Cancel
          </CloseOverlay>
          <GoTo
            to="SCR-TRAIN"
            cta={`Start ${run}`}
            disabled={!plan.data}
            title={plan.data ? undefined : "Available once the cost of the run is known"}
            // The dialog closes as the run starts, so the list is cached from the promise, not a per-call callback.
            onClick={() => void start.mutateAsync(project).then(runsCache, () => undefined)}
            className={buttonClass("primary", DIALOG_BUTTON)}
          >
            <Play size={10} fill="currentColor" aria-hidden />
            Start {run}
          </GoTo>
        </>
      }
    >
      <QueryView query={plan}>
        {(data) => (
          <PlanBody plan={data} onChange={(change) => update.mutate({ project, ...change }, { onSuccess: save })} />
        )}
      </QueryView>
    </Dialog>
  );
}

type Change = { steps?: number; copies?: number; coach?: boolean };

function PlanBody({ plan, onChange }: { plan: StartPlan; onChange: (change: Change) => void }) {
  return (
    <>
      <p className="leading-normal text-fg-secondary">{plan.intro}</p>
      <div className="grid grid-cols-2 gap-2.5">
        <CountField label="Practice steps" value={plan.steps} onCommit={(steps) => onChange({ steps })} />
        <CountField label="Parallel copies" value={plan.copies} onCommit={(copies) => onChange({ copies })} />
      </div>
      <div className="flex flex-col gap-2 rounded-card-sm bg-control px-3.5 py-3">
        <p className="flex">
          <span className="text-fg-secondary">Estimated time on your computer</span>
          <span className="ml-auto font-semibold">{plan.estimate}</span>
        </p>
        <p className="flex">
          <span className="text-fg-secondary">Uses</span>
          <span className="ml-auto">{plan.threads}</span>
        </p>
      </div>
      <div className="flex items-center gap-2.5">
        <Switch label="Let the copilot coach" checked={plan.coach} onChange={(coach) => onChange({ coach })} />
        <span className="flex flex-col">
          <span>Let the copilot coach</span>
          <span className="text-ui text-fg-tertiary">It watches, explains and asks before changing anything</span>
        </span>
      </div>
    </>
  );
}

// A whole-number field that shows thousands separators and commits a valid count on blur or Enter.
function CountField({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
  const [text, setText] = useState(value.toLocaleString("en-US"));
  const commit = () => {
    const parsed = Number(text.replaceAll(",", "").trim());
    if (Number.isInteger(parsed) && parsed > 0) {
      onCommit(parsed);
      setText(parsed.toLocaleString("en-US"));
      return;
    }
    setText(value.toLocaleString("en-US"));
  };
  return (
    <TextField
      label={label}
      mono
      inputMode="numeric"
      value={text}
      onChange={(event) => setText(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit();
        }
      }}
    />
  );
}
