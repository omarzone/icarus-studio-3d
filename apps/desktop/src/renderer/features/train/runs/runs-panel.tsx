// PNL-RUNS
import { Plus } from "lucide-react";
import { GoTo } from "../../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../../app/runtime/engine-query.tsx";
import { usePort } from "../../../app/runtime/port.tsx";
import { trainingPort } from "../../../ports/training-port.ts";
import { buttonClass } from "../../../ui/button-styles.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { useRuns, useRunsCache } from "../use-training.ts";
import { RunsTab } from "./runs-tab.tsx";

export function RunsPanel({ project, className = "flex-none" }: { project: string; className?: string }) {
  const port = usePort(trainingPort);
  const runs = useRuns(project);
  const cache = useRunsCache(project);
  const select = useEngineAction(port.selectRun);
  return (
    <Panel
      id="PNL-RUNS"
      className={className}
      tabs={<PanelTab label="Runs" active />}
      options={
        <GoTo
          to="MOD-START-TRAINING"
          cta="New run"
          aria-label="New run"
          title="Start a new training run"
          className={buttonClass("icon", "size-6! text-fg-tertiary!")}
        >
          <Plus size={14} strokeWidth={1.75} aria-hidden />
        </GoTo>
      }
    >
      <QueryView
        query={runs}
        isEmpty={(data) => data.runs.length === 0}
        empty={<EmptyState title="No runs yet" body="Start a run and every try shows up here." />}
      >
        {(data) => <RunsTab list={data} onSelect={(id) => select.mutate({ project, id }, { onSuccess: cache })} />}
      </QueryView>
    </Panel>
  );
}
