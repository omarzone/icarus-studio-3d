// PNL-PLAY-EVENTS
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { usePlaySession } from "../use-play-session.ts";
import { WhatHappenedTab } from "./what-happened-tab.tsx";

export function EventsPanel({ project, className = "h-42.5 flex-none" }: { project: string; className?: string }) {
  const session = usePlaySession(project);
  return (
    <Panel id="PNL-PLAY-EVENTS" className={className} tabs={<PanelTab label="What happened" active />}>
      <QueryView
        query={session}
        isEmpty={(data) => data.events.length === 0}
        empty={<EmptyState title="Nothing happened yet" body="Use a Play tool and what it does shows up here." />}
      >
        {(data) => <WhatHappenedTab events={data.events} />}
      </QueryView>
    </Panel>
  );
}
