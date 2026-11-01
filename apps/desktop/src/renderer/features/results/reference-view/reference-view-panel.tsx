// PNL-REFERENCE-VIEW
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEngineAction } from "../../../app/runtime/engine-query.tsx";
import { usePort } from "../../../app/runtime/port.tsx";
import { type ReferenceTests, resultsPort } from "../../../ports/results-port.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { resultsKeys, useReferenceTests } from "../use-results.ts";
import { ReferenceTestTab } from "./reference-test-tab.tsx";

// One tab per behavior test that has run.
export function ReferenceViewPanel({ project, className = "flex-1" }: { project: string; className?: string }) {
  const port = usePort(resultsPort);
  const client = useQueryClient();
  const tests = useReferenceTests(project);
  const selected = tests.data?.selected ?? "";
  const comparison = useQuery({
    queryKey: resultsKeys.referenceComparison(project, selected),
    queryFn: () => port.getReferenceComparison({ project, test: selected }),
    enabled: selected !== "",
  });
  const select = useEngineAction(port.selectReferenceTest);
  const save = (next: ReferenceTests) => client.setQueryData(resultsKeys.referenceTests(project), next);
  const ran = tests.data?.tests.filter((test) => test.state !== "not-run") ?? [];
  return (
    <Panel
      id="PNL-REFERENCE-VIEW"
      className={className}
      tabs={ran.map((test) => (
        <PanelTab
          key={test.id}
          label={test.short}
          active={test.id === selected}
          onSelect={() => select.mutate({ project, id: test.id }, { onSuccess: save })}
        />
      ))}
      options={
        comparison.data ? (
          <span className="rounded-control bg-control px-2 py-0.75 text-ui text-fg-tertiary">
            {comparison.data.basis}
          </span>
        ) : null
      }
    >
      {selected === "" ? (
        <QueryView query={tests}>
          {() => <EmptyState title="No test has run yet" body="Run a behavior test to compare it with recordings." />}
        </QueryView>
      ) : (
        <QueryView query={comparison}>{(data) => <ReferenceTestTab comparison={data} />}</QueryView>
      )}
    </Panel>
  );
}
