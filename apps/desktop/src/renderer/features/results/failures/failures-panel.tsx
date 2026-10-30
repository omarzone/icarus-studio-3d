// PNL-FAILURES
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useEngineAction } from "../../../app/runtime/engine-query.tsx";
import { usePort } from "../../../app/runtime/port.tsx";
import { type Failures, resultsPort } from "../../../ports/results-port.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { resultsKeys, useFailures } from "../use-results.ts";
import { AllTestRunsTab } from "./all-test-runs-tab.tsx";
import { FailuresTab } from "./failures-tab.tsx";

type Tab = "failures" | "all";

export function FailuresPanel({ project, className = "flex-none" }: { project: string; className?: string }) {
  const port = usePort(resultsPort);
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("failures");
  const failures = useFailures(project);
  const runs = useQuery({
    queryKey: resultsKeys.testRuns(project),
    queryFn: () => port.listTestRuns(project),
    enabled: tab === "all",
  });
  const select = useEngineAction(port.selectFailure);
  const save = (next: Failures) => client.setQueryData(resultsKeys.failures(project), next);
  return (
    <Panel
      id="PNL-FAILURES"
      className={className}
      tabs={
        <>
          <PanelTab label="Failures" active={tab === "failures"} onSelect={() => setTab("failures")} />
          <PanelTab label="All test runs" active={tab === "all"} onSelect={() => setTab("all")} />
        </>
      }
      options={failures.data ? <span className="text-ui text-fg-tertiary">{failures.data.total}</span> : null}
    >
      {tab === "failures" ? (
        <QueryView
          query={failures}
          isEmpty={(data) => data.groups.length === 0}
          empty={<EmptyState title="No failures found" body="Every test run passed." />}
        >
          {(data) => (
            <FailuresTab failures={data} onSelect={(id) => select.mutate({ project, id }, { onSuccess: save })} />
          )}
        </QueryView>
      ) : (
        <QueryView query={runs}>{(data) => <AllTestRunsTab runs={data} />}</QueryView>
      )}
    </Panel>
  );
}
