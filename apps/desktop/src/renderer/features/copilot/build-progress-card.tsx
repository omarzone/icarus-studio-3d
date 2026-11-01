import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { usePort, useRuntimeMode } from "../../app/runtime/port.tsx";
import { type BuildStep, buildProgressPort } from "../../ports/build-progress-port.ts";
import { QueryView } from "../../ui/query-view.tsx";

const POLL_MS = 500;

// Progress of a build (a build id in the app, a sample scene in the prototype), read again every half second
// in the app while it runs.
export function useBuildProgress(build: string | null) {
  const port = usePort(buildProgressPort);
  const mode = useRuntimeMode();
  return useQuery({
    queryKey: ["build-progress", build ?? ""],
    queryFn: () => port.getBuild(build ?? ""),
    enabled: build !== null,
    refetchInterval: (query) => {
      const data = query.state.data;
      return mode === "app" && (!data || (!data.ready && !data.error)) ? POLL_MS : false;
    },
  });
}

// Chat card while the copilot builds a project: progress bar and the steps, done, running and to do.
export function BuildProgressCard({ scene }: { scene: string }) {
  const build = useBuildProgress(scene);
  return (
    <div className="flex flex-col gap-3 rounded-bubble bg-control p-3.5">
      <QueryView query={build}>
        {(data) => {
          const current = data.steps.findIndex((step) => step.status === "running");
          const number = current === -1 ? data.steps.length : current + 1;
          return (
            <>
              <div className="flex items-center">
                <span className="font-semibold">Building {data.project}</span>
                <span className="ml-auto text-ui text-fg-tertiary">
                  step {number} of {data.steps.length}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={`Building ${data.project}`}
                aria-valuenow={Math.round(data.progress * 100)}
                className="h-1.5 rounded-bar bg-control-raised"
              >
                <div className="h-1.5 rounded-bar bg-fg" style={{ width: `${data.progress * 100}%` }} />
              </div>
              <div className="flex flex-col gap-2.25 text-ui">
                {data.steps.map((step) => (
                  <StepLine key={step.id} step={step} />
                ))}
              </div>
            </>
          );
        }}
      </QueryView>
    </div>
  );
}

function StepLine({ step }: { step: BuildStep }) {
  switch (step.status) {
    case "done":
      return (
        <span className="flex items-center gap-2.5">
          <Check size={13} strokeWidth={1.75} className="text-ok" aria-label="Done" />
          {step.label}
        </span>
      );
    case "running":
      return (
        <span className="flex items-center gap-2.5 font-semibold">
          <span
            role="img"
            aria-label="Running"
            className="size-3.25 animate-spin rounded-full border-2 border-fg border-r-transparent"
          />
          {step.label}
        </span>
      );
    case "todo":
      return (
        <span className="flex items-center gap-2.5 text-fg-tertiary">
          <span role="img" aria-label="To do" className="size-3.25 rounded-full border-[1.5px] border-fg-disabled" />
          {step.label}
        </span>
      );
  }
}
