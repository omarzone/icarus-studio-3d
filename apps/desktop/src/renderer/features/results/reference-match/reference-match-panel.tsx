// PNL-REFERENCE-MATCH
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { usePort } from "../../../app/runtime/port.tsx";
import { resultsPort } from "../../../ports/results-port.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { resultsKeys } from "../use-results.ts";
import { BehaviorMatchTab } from "./behavior-match-tab.tsx";
import { NeuronsTab } from "./neurons-tab.tsx";

type Tab = "match" | "neurons";

export function ReferenceMatchPanel({ project, className = "flex-none" }: { project: string; className?: string }) {
  const port = usePort(resultsPort);
  const [tab, setTab] = useState<Tab>("match");
  const match = useQuery({
    queryKey: resultsKeys.behaviorMatch(project),
    queryFn: () => port.getBehaviorMatch(project),
  });
  const neurons = useQuery({
    queryKey: resultsKeys.neurons(project),
    queryFn: () => port.getNeuronLinks(project),
    enabled: tab === "neurons",
  });
  const none = <EmptyState title="Nothing measured yet" body="Run a behavior test to fill this table." />;
  return (
    <Panel
      id="PNL-REFERENCE-MATCH"
      className={className}
      tabs={
        <>
          <PanelTab label="Behavior match" active={tab === "match"} onSelect={() => setTab("match")} />
          <PanelTab label="Neurons" active={tab === "neurons"} onSelect={() => setTab("neurons")} />
        </>
      }
    >
      {tab === "match" ? (
        <QueryView query={match} isEmpty={(data) => data.length === 0} empty={none}>
          {(data) => <BehaviorMatchTab rows={data} />}
        </QueryView>
      ) : (
        <QueryView query={neurons} isEmpty={(data) => data.length === 0} empty={none}>
          {(data) => <NeuronsTab links={data} />}
        </QueryView>
      )}
    </Panel>
  );
}
