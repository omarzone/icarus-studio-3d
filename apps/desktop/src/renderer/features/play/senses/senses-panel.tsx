// PNL-PLAY-SENSES
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { usePlaySession } from "../use-play-session.ts";
import { WhatItSensesTab } from "./what-it-senses-tab.tsx";

export function SensesPanel({ project, className = "flex-none" }: { project: string; className?: string }) {
  const session = usePlaySession(project);
  return (
    <Panel id="PNL-PLAY-SENSES" className={className} tabs={<PanelTab label="What it senses" active />}>
      <QueryView query={session}>{(data) => <WhatItSensesTab senses={data.senses} />}</QueryView>
    </Panel>
  );
}
