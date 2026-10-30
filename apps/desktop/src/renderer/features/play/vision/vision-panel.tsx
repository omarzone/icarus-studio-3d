// PNL-PLAY-VISION
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { EmptyState } from "../../../ui/states.tsx";
import { usePlaySession } from "../use-play-session.ts";
import { VisionTab } from "./vision-tab.tsx";

export function VisionPanel({ project, className = "h-48 flex-none" }: { project: string; className?: string }) {
  const session = usePlaySession(project);
  return (
    <Panel id="PNL-PLAY-VISION" className={className} tabs={<PanelTab label="Vision" active />}>
      <QueryView query={session}>
        {(data) =>
          data.vision ? (
            <VisionTab eyes={data.vision} />
          ) : (
            <EmptyState title="No eyes or cameras" body="Add a camera or eyes to the body to see what it sees." />
          )
        }
      </QueryView>
    </Panel>
  );
}
