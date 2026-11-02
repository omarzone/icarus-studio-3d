import { useQueryClient } from "@tanstack/react-query";
import { Stethoscope } from "lucide-react";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort, useRuntimeMode } from "../../app/runtime/port.tsx";
import { useSelectedRun } from "../../editor/training-queries.ts";
import { resultsPort } from "../../ports/results-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { Spinner } from "../../ui/spinner.tsx";
import { StatusPill } from "../../ui/status-pill.tsx";
import { useAutopilot } from "./use-training.ts";

// On the engine: the autopilot's state and asking the coach about the selected run now; the sample has neither.
export function CoachControls({ project }: { project: string }) {
  if (useRuntimeMode() !== "app") {
    return null;
  }
  return <EngineCoachControls project={project} />;
}

function EngineCoachControls({ project }: { project: string }) {
  const port = usePort(resultsPort);
  const client = useQueryClient();
  const run = useSelectedRun(project);
  const autopilot = useAutopilot(project);
  const diagnose = useEngineAction(port.diagnose);
  const progress = autopilot.data?.progress;
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["copilot", project] });
    void client.invalidateQueries({ queryKey: ["results", project] });
  };
  return (
    <>
      {progress ? (
        <GoTo
          to="MOD-AUTOPILOT"
          cta={progress.chip}
          title={progress.detail}
          className="rounded-full hover:opacity-90 active:opacity-80"
        >
          <StatusPill tone={progress.tone}>{progress.chip}</StatusPill>
        </GoTo>
      ) : null}
      <Act
        cta="Diagnose now"
        title="Ask the coach why this run behaves as it does; the answer appears in the chat"
        disabled={run === undefined || run === "" || diagnose.isPending}
        onClick={() => diagnose.mutate({ project, run }, { onSuccess: refresh })}
        className={buttonClass("ghost", "h-6.5! px-2!")}
      >
        {diagnose.isPending ? <Spinner /> : <Stethoscope size={13} strokeWidth={1.75} aria-hidden />}
        {diagnose.isPending ? "Diagnosing…" : "Diagnose now"}
      </Act>
    </>
  );
}
