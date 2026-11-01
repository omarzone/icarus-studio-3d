// PNL-METRICS
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { usePort } from "../../../app/runtime/port.tsx";
import { trainingPort } from "../../../ports/training-port.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { trainingKeys } from "../use-training.ts";
import { ConsoleTab } from "./console-tab.tsx";
import { MetricsTab } from "./metrics-tab.tsx";

type Tab = "metrics" | "console";

export function MetricsPanel({ project, className = "h-52.5 flex-none" }: { project: string; className?: string }) {
  const port = usePort(trainingPort);
  const [tab, setTab] = useState<Tab>("metrics");
  const metrics = useQuery({ queryKey: trainingKeys.metrics(project), queryFn: () => port.getMetrics(project) });
  const log = useQuery({
    queryKey: trainingKeys.console(project),
    queryFn: () => port.getConsole(project),
    enabled: tab === "console",
  });
  return (
    <Panel
      id="PNL-METRICS"
      className={className}
      tabs={
        <>
          <PanelTab label="Metrics" active={tab === "metrics"} onSelect={() => setTab("metrics")} />
          <PanelTab label="Console" active={tab === "console"} onSelect={() => setTab("console")} />
        </>
      }
      options={
        metrics.data?.progress ? (
          <span className="font-mono text-meta text-fg-tertiary">{metrics.data.progress}</span>
        ) : null
      }
    >
      {tab === "metrics" ? (
        <QueryView
          query={metrics}
          isEmpty={(data) => data.series.length === 0}
          empty={<EmptyState title="No metrics yet" body="The curves start with the first practice episodes." />}
        >
          {(data) => <MetricsTab metrics={data} />}
        </QueryView>
      ) : (
        <QueryView
          query={log}
          isEmpty={(data) => data.length === 0}
          empty={<EmptyState title="Nothing logged yet" body="Messages from the run appear here as it trains." />}
        >
          {(data) => <ConsoleTab lines={data} />}
        </QueryView>
      )}
    </Panel>
  );
}
