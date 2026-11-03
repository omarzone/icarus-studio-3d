// PNL-PLAY-VISION

import type { PlaySession } from "../../../ports/play-port.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { usePlaySlice } from "../use-play-session.ts";
import { VisionTab } from "./vision-tab.tsx";

const visionOf = (session: PlaySession) => session.vision;

export function VisionPanel({ project, className = "h-48 flex-none" }: { project: string; className?: string }) {
  const vision = usePlaySlice(project, visionOf);
  return (
    <Panel id="PNL-PLAY-VISION" className={className} tabs={<PanelTab label="Vision" active />}>
      <QueryView query={vision}>
        {(data) =>
          data ? (
            <VisionTab eyes={data} />
          ) : (
            <EmptyState title="No eyes or cameras" body="Add a camera or eyes to the body to see what it sees." />
          )
        }
      </QueryView>
    </Panel>
  );
}
