// MOD-DELETE-PROJECT
import { CloseOverlay } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type ProjectSummary, projectsPort } from "../../ports/projects-port.ts";
import { Dialog } from "../../ui/dialog.tsx";
import { ActionButton, dialogButtonClass } from "./dialog-controls.tsx";
import { DialogQuery } from "./dialog-query.tsx";
import { useFootprint } from "./footprint.ts";
import { deleteConsequences } from "./footprint-words.ts";
import { useOpenProject, useRefreshAfterAction } from "./open-project.ts";

export function DeleteProjectDialog() {
  const project = useOpenProject();
  return (
    <DialogQuery query={project} title="Delete project?" width="w-126.5">
      {(data) => <DeleteConfirm key={data.id} project={data} />}
    </DialogQuery>
  );
}

function DeleteConfirm({ project }: { project: ProjectSummary }) {
  const port = usePort(projectsPort);
  const remove = useEngineAction(port.deleteProject);
  const refresh = useRefreshAfterAction();
  const footprint = useFootprint(project.id);
  return (
    <Dialog
      title={`Delete ${project.name}?`}
      width="w-126.5"
      footer={
        <>
          <CloseOverlay cta="Cancel" className={dialogButtonClass("secondary")}>
            Cancel
          </CloseOverlay>
          <ActionButton
            cta="Delete project"
            to="SCR-PROJECTS"
            variant="destructive"
            disabled={!footprint.isSuccess}
            title={footprint.isSuccess ? undefined : "Available once Icarus knows exactly what would be deleted"}
            run={() => remove.mutateAsync(project.id).then(refresh)}
          >
            Delete project
          </ActionButton>
        </>
      }
    >
      <p className="text-body text-fg-secondary">
        {footprint.data
          ? deleteConsequences(project.name, footprint.data)
          : footprint.isError
            ? `What ${project.name} keeps on this computer cannot be checked yet, so it cannot be deleted from here.`
            : `Checking what ${project.name} keeps on this computer.`}
      </p>
    </Dialog>
  );
}
