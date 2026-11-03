// PNL-PLAY-EVENTS

import type { PlaySession } from "../../../ports/play-port.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { usePlaySlice } from "../use-play-session.ts";
import { WhatHappenedTab } from "./what-happened-tab.tsx";

const eventsOf = (session: PlaySession) => session.events;

export function EventsPanel({ project, className = "h-42.5 flex-none" }: { project: string; className?: string }) {
  const events = usePlaySlice(project, eventsOf);
  return (
    <Panel id="PNL-PLAY-EVENTS" className={className} tabs={<PanelTab label="What happened" active />}>
      <QueryView
        query={events}
        isEmpty={(data) => data.length === 0}
        empty={<EmptyState title="Nothing happened yet" body="Use a Play tool and what it does shows up here." />}
      >
        {(data) => <WhatHappenedTab events={data} />}
      </QueryView>
    </Panel>
  );
}
