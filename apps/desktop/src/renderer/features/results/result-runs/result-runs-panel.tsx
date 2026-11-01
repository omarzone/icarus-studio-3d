// PNL-RESULT-RUNS
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useEngineAction } from "../../../app/runtime/engine-query.tsx";
import { usePort } from "../../../app/runtime/port.tsx";
import { type ResultRun, resultsPort } from "../../../ports/results-port.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { resultsKeys } from "../use-results.ts";
import { BestBrainsTab } from "./best-brains-tab.tsx";
import { ResultRunsTab } from "./result-runs-tab.tsx";

type Tab = "runs" | "best";

const NO_RUNS = <EmptyState title="No finished runs yet" body="Results appear here once a run has a checkpoint." />;

export function ResultRunsPanel({ project, className = "flex-none" }: { project: string; className?: string }) {
  const port = usePort(resultsPort);
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("runs");
  const runs = useQuery({ queryKey: resultsKeys.runs(project), queryFn: () => port.listRuns(project) });
  const brains = useQuery({
    queryKey: resultsKeys.bestBrains(project),
    queryFn: () => port.listBestBrains(project),
    enabled: tab === "best",
  });
  const toggle = useEngineAction(port.toggleCompare);
  const save = (next: ResultRun[]) => client.setQueryData(resultsKeys.runs(project), next);
  const compared = runs.data?.filter((run) => run.compared).length ?? 0;
  return (
    <Panel
      id="PNL-RESULT-RUNS"
      className={className}
      tabs={
        <>
          <PanelTab label="Runs" active={tab === "runs"} onSelect={() => setTab("runs")} />
          <PanelTab label="Best brains" active={tab === "best"} onSelect={() => setTab("best")} />
        </>
      }
      options={compared > 0 ? <span className="text-ui text-fg-tertiary">Compare {compared}</span> : null}
    >
      {tab === "runs" ? (
        <QueryView query={runs} isEmpty={(data) => data.length === 0} empty={NO_RUNS}>
          {(data) => (
            <ResultRunsTab runs={data} onToggle={(id) => toggle.mutate({ project, id }, { onSuccess: save })} />
          )}
        </QueryView>
      ) : (
        <QueryView query={brains} isEmpty={(data) => data.length === 0} empty={NO_RUNS}>
          {(data) => <BestBrainsTab brains={data} />}
        </QueryView>
      )}
    </Panel>
  );
}
