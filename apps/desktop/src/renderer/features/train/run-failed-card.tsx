import { useQuery } from "@tanstack/react-query";
import { GoTo } from "../../app/navigation/go-to.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { trainingPort } from "../../ports/training-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { trainingKeys } from "./use-training.ts";

const ACTION = "h-8.5! px-4! text-body!";

// A run that stopped by itself: the reason in plain words, what is safe, technical details and the way back.
export function RunFailedCard({ project }: { project: string }) {
  const port = usePort(trainingPort);
  const failure = useQuery({ queryKey: trainingKeys.failure(project), queryFn: () => port.getFailure(project) });
  return (
    <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-scrim-modal">
      <section
        role="alert"
        className="pointer-events-auto flex w-115 flex-col gap-3 rounded-bubble bg-floating p-5 shadow-dialog"
      >
        <QueryView query={failure}>
          {(data) => (
            <>
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="grid size-8 place-items-center rounded-full bg-danger-tint font-bold text-danger"
                >
                  !
                </span>
                <h2 className="text-title-3 font-semibold">{data.title}</h2>
              </div>
              <p className="leading-[1.55] text-fg-secondary">{data.reason}</p>
              <div className="rounded-card-sm bg-control px-3 py-2.5 font-mono text-mono leading-[1.7] text-fg-secondary select-text">
                {data.details.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
              <div className="flex gap-2">
                <GoTo to="MOD-START-TRAINING" cta="Fix and restart" className={buttonClass("primary", ACTION)}>
                  Fix and restart
                </GoTo>
                <GoTo to="SCR-TRAIN" cta="View log" className={buttonClass("secondary", ACTION)}>
                  View log
                </GoTo>
                <GoTo to="SCR-RESULTS" cta={`Back to ${data.lastGoodRun}`} className={buttonClass("secondary", ACTION)}>
                  Back to {data.lastGoodRun}
                </GoTo>
              </div>
            </>
          )}
        </QueryView>
      </section>
    </div>
  );
}
