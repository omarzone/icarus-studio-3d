// TAB-CURRICULUM
import type { CurriculumStage } from "../../../ports/brain-port.ts";
import { EmptyState } from "../../../ui/states.tsx";
import { StatusPill } from "../../../ui/status-pill.tsx";

// Stages that make the task harder as the brain improves; the one it practices now is marked.
export function CurriculumTab({ stages }: { stages: readonly CurriculumStage[] }) {
  if (stages.length === 0) {
    return (
      <EmptyState
        title="One stage"
        body="The brain practices the whole task from the start. Ask the copilot to add stages that make it harder."
      />
    );
  }
  return (
    <ol className="grid h-full grid-cols-3 content-start gap-2.5 overflow-y-auto px-3 pt-2.5 pb-3">
      {stages.map((stage, index) => (
        <li key={stage.id} className="flex flex-col gap-1.5 rounded-card-sm bg-control px-3 py-2.5">
          <span className="flex items-center gap-2">
            <span className="font-semibold">
              {index + 1}. {stage.name}
            </span>
            {stage.active ? (
              <span className="ml-auto">
                <StatusPill tone="ok">Now</StatusPill>
              </span>
            ) : null}
          </span>
          <span className="text-ui text-fg-secondary">{stage.detail}</span>
        </li>
      ))}
    </ol>
  );
}
