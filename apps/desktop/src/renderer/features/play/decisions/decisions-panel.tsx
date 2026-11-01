// PNL-PLAY-DECISIONS
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { usePlaySession } from "../use-play-session.ts";
import { WhatItDecidesTab } from "./what-it-decides-tab.tsx";

export function DecisionsPanel({ project, className = "flex-1" }: { project: string; className?: string }) {
  const session = usePlaySession(project);
  return (
    <Panel id="PNL-PLAY-DECISIONS" className={className} tabs={<PanelTab label="What it decides" active />}>
      <QueryView query={session}>
        {(data) =>
          data.decisions ? (
            <WhatItDecidesTab bars={data.decisions.bars} brain={data.decisions.brain} />
          ) : (
            <EmptyState
              title="No learned brain"
              body="This brain is wired, not trained, so it has no outputs to show."
            />
          )
        }
      </QueryView>
    </Panel>
  );
}
