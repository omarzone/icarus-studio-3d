// PNL-BUILD-TARGET-VIEW
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEngineAction } from "../../../app/runtime/engine-query.tsx";
import { usePort } from "../../../app/runtime/port.tsx";
import { type CommunityPage, publishPort } from "../../../ports/publish-port.ts";
import { Panel, PanelTab } from "../../../ui/panel.tsx";
import { QueryView } from "../../../ui/query-view.tsx";
import { ShareToCommunityTab } from "./share-to-community-tab.tsx";

type Props = { project: string; projectName: string; underOverlay: boolean; className?: string };

export const communityPageKey = (project: string) => ["publish", "page", project] as const;

// The selected build target; Build opens on the community page.
export function BuildTargetViewPanel({ project, projectName, underOverlay, className = "flex-1" }: Props) {
  const port = usePort(publishPort);
  const client = useQueryClient();
  const key = communityPageKey(project);
  const page = useQuery({ queryKey: key, queryFn: () => port.getCommunityPage(project) });
  const update = useEngineAction(port.updateCommunityPage);
  const saveDraft = useEngineAction(port.saveDraft);
  const saved = { onSuccess: (next: CommunityPage) => client.setQueryData(key, next) };
  return (
    <Panel id="PNL-BUILD-TARGET-VIEW" className={className} tabs={<PanelTab label="Share to community" active />}>
      <QueryView query={page}>
        {(data) => (
          <ShareToCommunityTab
            page={data}
            project={projectName}
            underOverlay={underOverlay}
            onEdit={(edit) => update.mutate({ project, ...edit }, saved)}
            onPermission={(id, on) => update.mutate({ project, permission: { id, on } }, saved)}
            onSaveDraft={() => saveDraft.mutate(project)}
          />
        )}
      </QueryView>
    </Panel>
  );
}
