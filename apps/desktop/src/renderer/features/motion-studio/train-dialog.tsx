// MOD-MOTION-TRAIN
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useState } from "react";
import { CloseOverlay } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type MotionTrainingPlan, motionPort } from "../../ports/motion-port.ts";
import { ActionButton } from "../../ui/action-button.tsx";
import { ChoiceCard } from "../../ui/choice-card.tsx";
import { Dialog } from "../../ui/dialog.tsx";
import { dialogButtonClass } from "../../ui/dialog-button.ts";
import { ProjectDialogGate } from "../../ui/project-dialog-gate.tsx";
import { useProjectKey } from "../../ui/project-name.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { TextField } from "../../ui/text-field.tsx";

// Sample clip of the gallery and prototype; the app uses the open project's.
const CLIP = "dance-copy";

// Start training the copy with a clear focus: practice steps, parallel copies and what to practice most.
export function TrainDialog() {
  return (
    <ProjectDialogGate projectKey={useProjectKey(CLIP)} title="Train the copy">
      {(clip) => <TrainCopy clip={clip} />}
    </ProjectDialogGate>
  );
}

function TrainCopy({ clip }: { clip: string }) {
  const port = usePort(motionPort);
  const client = useQueryClient();
  const key = ["motion", clip, "plan"] as const;
  const query = useQuery({ queryKey: key, queryFn: () => port.getTrainingPlan(clip) });
  const setFocus = useEngineAction(port.setTrainingFocus);
  // The steps and copies as typed; the plan's own until the person changes them.
  const [typed, setTyped] = useState<{ steps?: string; copies?: string }>({});
  return (
    <Dialog
      title={query.data?.title ?? "Train the copy"}
      width="w-130"
      footer={
        <>
          <CloseOverlay cta="Cancel" className={dialogButtonClass("secondary")}>
            Cancel
          </CloseOverlay>
          <ActionButton
            cta="Start training"
            to="STA-MOTION-TRAINING"
            run={() =>
              port.startTraining({
                clip,
                steps: typed.steps ?? query.data?.steps ?? "",
                copies: typed.copies ?? query.data?.copies ?? "",
              })
            }
            className={dialogButtonClass("primary")}
          >
            <Play size={10} fill="currentColor" aria-hidden />
            Start training
          </ActionButton>
        </>
      }
    >
      <QueryView query={query}>
        {(plan) => (
          <PlanBody
            plan={plan}
            onTyped={(field, value) => setTyped((current) => ({ ...current, [field]: value }))}
            onFocus={(focus) =>
              setFocus.mutate(
                { clip, focus },
                { onSuccess: (next: MotionTrainingPlan) => client.setQueryData(key, next) },
              )
            }
          />
        )}
      </QueryView>
    </Dialog>
  );
}

type PlanProps = {
  plan: MotionTrainingPlan;
  onFocus: (focus: string) => void;
  onTyped: (field: "steps" | "copies", value: string) => void;
};

function PlanBody({ plan, onFocus, onTyped }: PlanProps) {
  const [steps, setSteps] = useState(plan.steps);
  const [copies, setCopies] = useState(plan.copies);
  return (
    <>
      <p className="-mt-1 text-body text-fg-secondary">{plan.intro}</p>
      <div className="grid grid-cols-2 gap-2.5">
        <TextField
          label="Practice steps"
          mono
          value={steps}
          onChange={(event) => {
            setSteps(event.currentTarget.value);
            onTyped("steps", event.currentTarget.value);
          }}
        />
        <TextField
          label="Parallel copies"
          mono
          value={copies}
          onChange={(event) => {
            setCopies(event.currentTarget.value);
            onTyped("copies", event.currentTarget.value);
          }}
        />
      </div>
      <div role="radiogroup" aria-label="What to practice" className="flex flex-col gap-4">
        {plan.focuses.map((focus) => (
          <ChoiceCard
            key={focus.id}
            title={focus.title}
            detail={focus.detail}
            checked={focus.id === plan.focus}
            onSelect={() => onFocus(focus.id)}
          />
        ))}
      </div>
      <div className="flex rounded-[14px] bg-control px-3.5 py-3">
        <span className="text-fg-secondary">Estimated time on your computer</span>
        <span className="ml-auto font-semibold">{plan.estimate}</span>
      </div>
    </>
  );
}
