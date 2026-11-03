// PNL-FAILURES
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useEngineAction } from "../../../app/runtime/engine-query.tsx";
import { usePort, useRuntimeMode } from "../../../app/runtime/port.tsx";
import { type Failures, resultsPort } from "../../../ports/results-port.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { resultsKeys, useFailures } from "../use-results.ts";
import { AllTestRunsTab } from "./all-test-runs-tab.tsx";
import { DiagnosesTab } from "./diagnoses-tab.tsx";
import { FailuresTab } from "./failures-tab.tsx";

type Tab = "failures" | "all" | "diagnoses";

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
  // Diagnoses come from the coach on the engine; the sample design has no such tab.
  const app = useRuntimeMode() === "app";
  const save = (next: Failures) => {
    client.setQueryData(resultsKeys.failures(project), next);
    void client.invalidateQueries({ queryKey: resultsKeys.replay(project) });
  };
  return (
    <Panel
      id="PNL-FAILURES"
      className={className}
      tabs={
        <>
          <PanelTab label="Failures" active={tab === "failures"} onSelect={() => setTab("failures")} />
          <PanelTab label="All test runs" active={tab === "all"} onSelect={() => setTab("all")} />
          {app ? (
            <PanelTab label="Diagnoses" active={tab === "diagnoses"} onSelect={() => setTab("diagnoses")} />
          ) : null}
        </>
      }
      options={failures.data ? <span className="text-ui text-fg-tertiary">{failures.data.total}</span> : null}
    >
      {tab === "failures" ? (
        <QueryView
          query={failures}
          isEmpty={(data) => data.groups.length === 0}
          empty={
            <EmptyState
              title="No failure groups yet"
              body="They appear once a checkpoint has been evaluated, or after the coach diagnoses a run."
            />
          }
        >
          {(data) => (
            <FailuresTab failures={data} onSelect={(id) => select.mutate({ project, id }, { onSuccess: save })} />
          )}
        </QueryView>
      ) : tab === "all" ? (
        <QueryView
          query={runs}
          isEmpty={(data) => data.length === 0}
          empty={
            <EmptyState title="No test runs yet" body="Every checkpoint is tested on fixed evaluation episodes." />
          }
        >
          {(data) => <AllTestRunsTab runs={data} />}
        </QueryView>
      ) : (
        <DiagnosesTab project={project} />
      )}
    </Panel>
  );
}
