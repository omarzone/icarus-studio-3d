// MOD-RENAME
import { useState } from "react";
import { CloseOverlay } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type ProjectSummary, projectsPort } from "../../ports/projects-port.ts";
import { Dialog } from "../../ui/dialog.tsx";
import { ActionButton, dialogButtonClass, TextField } from "./dialog-controls.tsx";
import { DialogQuery } from "./dialog-query.tsx";
import { useOpenProject, useRefreshAfterAction } from "./open-project.ts";

export function RenameDialog() {
  const project = useOpenProject();
  return (
    <DialogQuery query={project} title="Rename project" width="w-121.5">
      {(data) => <RenameForm key={data.id} project={data} />}
    </DialogQuery>
  );
}

function RenameForm({ project }: { project: ProjectSummary }) {
  const port = usePort(projectsPort);
  const rename = useEngineAction(port.renameProject);
  const refresh = useRefreshAfterAction();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const trimmed = name.trim();
  return (
    <Dialog
      title="Rename project"
      width="w-121.5"
      footer={
        <>
          <CloseOverlay cta="Cancel" className={dialogButtonClass("secondary")}>
            Cancel
          </CloseOverlay>
          <ActionButton
            cta="Save"
            variant="primary"
            disabled={trimmed === ""}
            title={trimmed === "" ? "A project needs a name" : undefined}
            run={() =>
              rename.mutateAsync({ id: project.id, name: trimmed, description: description.trim() }).then(refresh)
            }
          >
            Save
          </ActionButton>
        </>
      }
    >
      <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      <TextField
        label="Short description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
    </Dialog>
  );
}
