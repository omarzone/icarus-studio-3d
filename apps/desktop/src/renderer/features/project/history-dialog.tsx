// MOD-HISTORY
import { useQuery } from "@tanstack/react-query";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import type { ProjectSummary } from "../../ports/projects-port.ts";
import { type RevisionSummary, revisionsPort } from "../../ports/revisions-port.ts";
import { Dialog } from "../../ui/dialog.tsx";
import { QueryView } from "../../ui/query-view.tsx";
import { EmptyState } from "../../ui/states.tsx";
import { ActionButton } from "./dialog-controls.tsx";
import { DialogQuery } from "./dialog-query.tsx";
import { useOpenProject, useRefreshAfterAction } from "./open-project.ts";

export function HistoryDialog() {
  const project = useOpenProject();
  return (
    <DialogQuery query={project} title="History" width="w-161.5">
      {(data) => <ProjectHistory key={data.id} project={data} />}
    </DialogQuery>
  );
}

function ProjectHistory({ project }: { project: ProjectSummary }) {
  const port = usePort(revisionsPort);
  const revisions = useQuery({ queryKey: ["revisions", project.id], queryFn: () => port.listRevisions(project.id) });
  const restore = useEngineAction(port.restoreRevision);
  const refresh = useRefreshAfterAction();
  return (
    <Dialog title={`History of ${project.name}`} width="w-161.5">
      <p className="text-body text-fg-secondary">
        Every change, yours or the copilot’s, is saved. Restoring creates a new version, nothing is lost.
      </p>
      <QueryView
        query={revisions}
        isEmpty={(list) => list.length === 0}
        empty={<EmptyState title="No revisions yet" body="Every change to the project will appear here." />}
      >
        {(list) => (
          <ul className="flex flex-col gap-1">
            {list.map((revision) => (
              <RevisionRow
                key={revision.id}
                revision={revision}
                onRestore={() => restore.mutateAsync({ projectId: project.id, revisionId: revision.id }).then(refresh)}
              />
            ))}
          </ul>
        )}
      </QueryView>
    </Dialog>
  );
}

function RevisionRow({ revision, onRestore }: { revision: RevisionSummary; onRestore: () => Promise<unknown> }) {
  return (
    <li
      className={`grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 rounded-card-sm p-3 ${revision.current ? "bg-control" : ""}`}
    >
      <span className="font-mono text-body font-semibold">{revision.id}</span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body">{revision.change}</span>
        <span className="text-meta text-fg-tertiary">
          by {revision.author} · {revision.when}
        </span>
      </span>
      {revision.current ? (
        <span className="flex h-6.5 items-center rounded-full bg-ok-tint px-2.5 text-ui text-ok">current</span>
      ) : (
        <ActionButton cta="Restore" variant="secondary" run={onRestore}>
          Restore
        </ActionButton>
      )}
    </li>
  );
}
