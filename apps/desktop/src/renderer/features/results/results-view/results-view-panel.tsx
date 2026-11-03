// PNL-RESULTS-VIEW
import { useQuery } from "@tanstack/react-query";
import { GoTo } from "../../../app/navigation/go-to.tsx";
import { usePort, useRuntimeMode } from "../../../app/runtime/port.tsx";
import { resultsPort } from "../../../ports/results-port.ts";
import { Panel, PanelTab, panelTabClass } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { resultsKeys } from "../use-results.ts";
import { CompareTab } from "./compare-tab.tsx";
import { TimelapseTab } from "./timelapse-tab.tsx";
import { WhereItFailsTab } from "./where-it-fails-tab.tsx";

export type ResultsViewTab = "compare" | "where-it-fails";

type Props = { project: string; tab: ResultsViewTab; className?: string };

// Compare and Where it fails are states of the Results workspace, so each tab leads to its route.
export function ResultsViewPanel({ project, tab, className = "flex-1" }: Props) {
  const port = usePort(resultsPort);
  const comparison = useQuery({
    queryKey: resultsKeys.comparison(project),
    queryFn: () => port.getComparison(project),
    enabled: tab === "compare",
  });
  const replay = useQuery({
    queryKey: resultsKeys.replay(project),
    queryFn: () => port.getFailureReplay(project),
    enabled: tab === "where-it-fails",
  });
  // The sample always compares on the same seed; the app says only what the compared runs recorded.
  const app = useRuntimeMode() === "app";
  const basis = comparison.data?.basis ?? (app ? null : "Same seed");
  return (
    <Panel
      id="PNL-RESULTS-VIEW"
      className={className}
      tabs={
        <>
          <ViewTab label="Compare" active={tab === "compare"} to="SCR-RESULTS" />
          <ViewTab label="Where it fails" active={tab === "where-it-fails"} to="STA-RESULTS-FAILURES" />
          <TimelapseTab />
          {app ? <ViewTab label="Behavior tests" active={false} to="STA-RESULTS-REFERENCE" /> : null}
        </>
      }
      options={
        basis === null ? null : (
          <span className="rounded-control bg-control px-2 py-0.75 text-ui text-fg-tertiary">{basis}</span>
        )
      }
    >
      {tab === "compare" ? (
        <QueryView
          query={comparison}
          isEmpty={(data) => data.sides.length < 2}
          empty={<EmptyState title="Pick two runs" body="Tick two runs in the Runs list to compare them." />}
        >
          {(data) => <CompareTab comparison={data} />}
        </QueryView>
      ) : (
        <QueryView
          query={replay}
          isEmpty={(data) => data.empty === true}
          empty={
            <EmptyState
              title="No failure groups yet"
              body="They appear once a checkpoint has been evaluated, or after the coach diagnoses a run."
            />
          }
        >
          {(data) => <WhereItFailsTab replay={data} />}
        </QueryView>
      )}
    </Panel>
  );
}

function ViewTab({
  label,
  active,
  to,
}: {
  label: string;
  active: boolean;
  to: "SCR-RESULTS" | "STA-RESULTS-FAILURES" | "STA-RESULTS-REFERENCE";
}) {
  if (active) {
    return <PanelTab label={label} active />;
  }
  return (
    <GoTo to={to} cta={label} role="tab" aria-selected={false} className={panelTabClass(false)}>
      {label}
    </GoTo>
  );
}
