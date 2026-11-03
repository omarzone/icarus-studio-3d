// PNL-PLAY-SENSES

import type { PlaySession } from "../../../ports/play-port.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { usePlaySlice } from "../use-play-session.ts";
import { WhatItSensesTab } from "./what-it-senses-tab.tsx";

const sensesOf = (session: PlaySession) => session.senses;

export function SensesPanel({ project, className = "flex-none" }: { project: string; className?: string }) {
  const senses = usePlaySlice(project, sensesOf);
  return (
    <Panel id="PNL-PLAY-SENSES" className={className} tabs={<PanelTab label="What it senses" active />}>
      <QueryView query={senses}>{(data) => <WhatItSensesTab senses={data} />}</QueryView>
    </Panel>
  );
}
