// MOD-DUPLICATE
import { useState } from "react";
import { CloseOverlay } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { useNotices } from "../../app/runtime/notices.ts";
import { usePort } from "../../app/runtime/port.tsx";
import { type ProjectSummary, projectsPort } from "../../ports/projects-port.ts";
import { Dialog } from "../../ui/dialog.tsx";
import { formatBytes } from "./byte-size.ts";
import { ActionButton, dialogButtonClass, SwitchRow, TextField } from "./dialog-controls.tsx";
import { DialogQuery } from "./dialog-query.tsx";
import { useFootprint } from "./footprint.ts";
import { useOpenProject, useRefreshAfterAction } from "./open-project.ts";

const PARTS = ["design", "brains", "runs"] as const;
type Part = (typeof PARTS)[number];

export function DuplicateDialog() {
  const project = useOpenProject();
  return (
    <DialogQuery query={project} title="Duplicate project" width="w-126.5">
      {(data) => <DuplicateForm key={data.id} project={data} />}
    </DialogQuery>
  );
}

function DuplicateForm({ project }: { project: ProjectSummary }) {
  const port = usePort(projectsPort);
  const duplicate = useEngineAction(port.duplicateProject);
  const refresh = useRefreshAfterAction();
  const notify = useNotices((state) => state.notify);
  const footprint = useFootprint(project.id);
  const [name, setName] = useState(`${project.name} copy`);
  // Runs are heavy, so they stay behind unless asked for.
  const [include, setInclude] = useState<Record<Part, boolean>>({ design: true, brains: true, runs: false });
  const toggle = (part: Part) => (checked: boolean) => setInclude((current) => ({ ...current, [part]: checked }));
  const runsSize = footprint.data && footprint.data.runsBytes > 0 ? ` · ${formatBytes(footprint.data.runsBytes)}` : "";
  const trimmed = name.trim();
  const parts = PARTS.filter((part) => include[part]);
  return (
    <Dialog
      title={`Duplicate ${project.name}`}
      width="w-126.5"
      footer={
        <>
          <CloseOverlay cta="Cancel" className={dialogButtonClass("secondary")}>
            Cancel
          </CloseOverlay>
          <ActionButton
            cta="Duplicate"
            variant="primary"
            disabled={trimmed === ""}
            title={trimmed === "" ? "The copy needs a name" : undefined}
            run={() =>
              duplicate
                .mutateAsync({ id: project.id, name: trimmed, include: parts })
                .then((copy) => notify({ title: "Project duplicated", detail: copy.name }))
                .then(refresh)
            }
          >
            Duplicate
          </ActionButton>
        </>
      }
    >
      <TextField label="New name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      <div className="flex flex-col gap-2.5">
        <SwitchRow label="World and body" cta="World and body" checked={include.design} onChange={toggle("design")} />
        <SwitchRow label="Trained brains" cta="Trained brains" checked={include.brains} onChange={toggle("brains")} />
        <SwitchRow
          label={`Training runs and timelapses${runsSize}`}
          cta="Training runs and timelapses"
          checked={include.runs}
          onChange={toggle("runs")}
        />
      </div>
    </Dialog>
  );
}
