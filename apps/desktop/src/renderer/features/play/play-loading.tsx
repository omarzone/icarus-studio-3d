import type { PlayStage } from "../../ports/play-port.ts";
import type { ProgressStep } from "../../ports/progress-step.ts";
import { ProgressSteps } from "../../ui/progress-steps.tsx";

const STEPS: readonly { stage: PlayStage; text: string }[] = [
  { stage: "world", text: "Preparing the world…" },
  { stage: "brain", text: "Loading the brain…" },
  { stage: "starting", text: "Starting the session…" },
];

// The opening steps as the engine reported them; before its first report nothing has started yet.
export function loadingSteps(stage: PlayStage | undefined): ProgressStep[] {
  const reached = stage === undefined ? -1 : STEPS.findIndex((step) => step.stage === stage);
  return STEPS.map((step, index) => ({
    text: step.text,
    state: index < reached ? "done" : index === reached ? "running" : "todo",
  }));
}

export function loadingTitle(stage: PlayStage | undefined): string {
  return STEPS.find((step) => step.stage === stage)?.text ?? "Connecting to the engine…";
}

// Covers the viewport while a Play session opens, so it never looks blank or frozen.
export function PlayLoading({ stage }: { stage: PlayStage | undefined }) {
  const title = loadingTitle(stage);
  return (
    <div
      role="status"
      aria-label={title}
      className="absolute inset-0 flex items-center justify-center bg-scrim-popover"
    >
      <div className="flex flex-col gap-3 rounded-card-sm bg-overlay px-5 py-4">
        <span className="font-semibold">Opening Play</span>
        <ProgressSteps steps={loadingSteps(stage)} />
        <span className="text-meta text-fg-tertiary">Nothing here changes the project.</span>
      </div>
    </div>
  );
}
