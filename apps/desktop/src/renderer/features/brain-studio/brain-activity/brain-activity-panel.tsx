// PNL-BRAIN-ACTIVITY
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { usePort } from "../../../app/runtime/port.tsx";
import { brainPort } from "../../../ports/brain-port.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { BehaviorsTab } from "./behaviors-tab.tsx";
import { BrainActivityTab } from "./brain-activity-tab.tsx";
import { WiringTab } from "./wiring-tab.tsx";

type Tab = "activity" | "behaviors" | "wiring";

export function BrainActivityPanel({ brain, className = "h-49 shrink-0" }: { brain: string; className?: string }) {
  const port = usePort(brainPort);
  const activity = useQuery({ queryKey: ["brain", brain, "activity"], queryFn: () => port.getActivity(brain) });
  const [tab, setTab] = useState<Tab>("activity");
  return (
    <Panel
      id="PNL-BRAIN-ACTIVITY"
      className={className}
      tabs={
        <>
          <PanelTab label="Brain activity" active={tab === "activity"} onSelect={() => setTab("activity")} />
          <PanelTab label="Behaviors" active={tab === "behaviors"} onSelect={() => setTab("behaviors")} />
          <PanelTab label="Wiring" active={tab === "wiring"} onSelect={() => setTab("wiring")} />
        </>
      }
      options={activity.data?.live ? <span className="pr-1 text-ui text-danger">● live</span> : null}
    >
      {tab === "activity" ? (
        <QueryView
          query={activity}
          isEmpty={(data) => data.regions.length === 0}
          empty={<EmptyState title="No activity yet" body="Brain activity shows here while the body is simulated." />}
        >
          {(data) => <BrainActivityTab regions={data.regions} />}
        </QueryView>
      ) : tab === "behaviors" ? (
        <BehaviorsTab brain={brain} />
      ) : (
        <WiringTab brain={brain} />
      )}
    </Panel>
  );
}
