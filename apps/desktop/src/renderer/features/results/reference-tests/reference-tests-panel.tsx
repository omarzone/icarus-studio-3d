// PNL-REFERENCE-TESTS
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Act } from "../../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../../app/runtime/engine-query.tsx";
import { usePort } from "../../../app/runtime/port.tsx";
import { type ReferenceTests, resultsPort } from "../../../ports/results-port.ts";
import { buttonClass } from "../../../ui/button-styles.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { resultsKeys, useReferenceTests } from "../use-results.ts";
import { BehaviorTestsTab } from "./behavior-tests-tab.tsx";
import { RecordingsTab } from "./recordings-tab.tsx";

type Tab = "tests" | "recordings";

export function ReferenceTestsPanel({ project, className = "flex-none" }: { project: string; className?: string }) {
  const port = usePort(resultsPort);
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("tests");
  const tests = useReferenceTests(project);
  const recordings = useQuery({
    queryKey: resultsKeys.recordings(project),
    queryFn: () => port.listRecordings(project),
    enabled: tab === "recordings",
  });
  const select = useEngineAction(port.selectReferenceTest);
  const save = (next: ReferenceTests) => client.setQueryData(resultsKeys.referenceTests(project), next);
  return (
    <Panel
      id="PNL-REFERENCE-TESTS"
      className={className}
      tabs={
        <>
          <PanelTab label="Behavior tests" active={tab === "tests"} onSelect={() => setTab("tests")} />
          <PanelTab label="Recordings" active={tab === "recordings"} onSelect={() => setTab("recordings")} />
        </>
      }
      options={
        <Act
          cta="Add a test"
          aria-label="Add a test"
          title="Add a behavior test"
          className={buttonClass("icon", "size-6! text-fg-tertiary!")}
        >
          <Plus size={14} strokeWidth={1.75} aria-hidden />
        </Act>
      }
    >
      {tab === "tests" ? (
        <QueryView
          query={tests}
          isEmpty={(data) => data.tests.length === 0}
          empty={
            <EmptyState title="No behavior tests yet" body="Import a recording to compare against real behavior." />
          }
        >
          {(data) => (
            <BehaviorTestsTab tests={data} onSelect={(id) => select.mutate({ project, id }, { onSuccess: save })} />
          )}
        </QueryView>
      ) : (
        <QueryView
          query={recordings}
          isEmpty={(data) => data.length === 0}
          empty={<EmptyState title="No recordings yet" body="Import recordings of real behavior to compare with." />}
        >
          {(data) => <RecordingsTab recordings={data} />}
        </QueryView>
      )}
    </Panel>
  );
}
