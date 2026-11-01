// MOD-AUTOPILOT
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Act, CloseOverlay } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type AutopilotSettings, trainingPort } from "../../ports/training-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { Dialog } from "../../ui/dialog.tsx";
import { useProjectName } from "../../ui/project-name.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { TRAIN_CONFIG } from "./train-variants.ts";
import { trainingKeys } from "./use-training.ts";

// How much the copilot may change on its own during training: off, ask first, or fix within a limit.
export function AutopilotDialog() {
  const project = useProjectName(TRAIN_CONFIG.project).id;
  const port = usePort(trainingPort);
  const client = useQueryClient();
  const settings = useQuery({ queryKey: trainingKeys.autopilot(project), queryFn: () => port.getAutopilot(project) });
  const set = useEngineAction(port.setAutopilot);
  const save = (next: AutopilotSettings) => client.setQueryData(trainingKeys.autopilot(project), next);
  return (
    <Dialog
      title="Autopilot"
      width="w-115"
      footer={
        <CloseOverlay cta="Done" className={buttonClass("primary", "h-8.5! px-4! text-body!")}>
          Done
        </CloseOverlay>
      }
    >
      <QueryView query={settings}>
        {(data) => (
          <>
            <p className="leading-normal text-fg-tertiary">{data.intro}</p>
            <div role="radiogroup" aria-label="Autopilot" className="flex flex-col gap-4">
              {data.options.map((option) => {
                const selected = option.mode === data.mode;
                return (
                  <Act
                    key={option.mode}
                    cta={option.label}
                    role="radio"
                    aria-checked={selected}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => set.mutate({ project, mode: option.mode }, { onSuccess: save })}
                    className={`flex items-start gap-3 rounded-card-sm bg-control px-3.5 py-3 text-left ${
                      selected ? "shadow-[inset_0_0_0_1.5px_var(--ic-fg)]" : "hover:bg-control-raised"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 ${
                        selected ? "border-fg" : "border-fg-disabled"
                      }`}
                    >
                      {selected ? <span className="size-2 rounded-full bg-fg" /> : null}
                    </span>
                    <span className="flex flex-1 flex-col gap-0.75">
                      <span className="font-semibold">{option.label}</span>
                      <span className="text-ui leading-normal text-fg-tertiary">{option.detail}</span>
                    </span>
                  </Act>
                );
              })}
            </div>
          </>
        )}
      </QueryView>
    </Dialog>
  );
}
