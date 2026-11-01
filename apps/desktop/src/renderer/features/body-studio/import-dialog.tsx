// MOD-IMPORT
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { bodyPort, type ImportPreview } from "../../ports/body-port.ts";
import { ActionButton } from "../../ui/action-button.tsx";
import { buttonClass } from "../../ui/button-styles.ts";
import { Dialog } from "../../ui/dialog.tsx";
import { ProjectDialogGate } from "../../ui/project-dialog-gate.tsx";
import { useProjectKey } from "../../ui/project-name.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { Segmented } from "../../ui/segmented.tsx";
import { StatusPill } from "../../ui/status-pill.tsx";
import { CheckLine } from "../copilot/chat-messages.tsx";

// Sample body of the gallery and prototype; the app uses the open project's.
const BODY = "dance-copy";

// Bring a model, environment or robot description in, as a static mesh or rigged for physics. Opens over any screen.
export function ImportDialog() {
  return (
    <ProjectDialogGate projectKey={useProjectKey(BODY)} title="Import">
      {(body) => <Import body={body} />}
    </ProjectDialogGate>
  );
}

function Import({ body }: { body: string }) {
  const port = usePort(bodyPort);
  const client = useQueryClient();
  const key = ["body", body, "import"] as const;
  const query = useQuery({ queryKey: key, queryFn: () => port.getImport(body) });
  const setKind = useEngineAction(port.setImportKind);
  return (
    <Dialog title="Import" width="w-155">
      <QueryView query={query}>
        {(preview) => (
          <ImportBody
            preview={preview}
            onKind={(kind) => setKind.mutate({ body, kind }, { onSuccess: (next) => client.setQueryData(key, next) })}
            onStatic={() => port.importStatic(body)}
            onRig={() => port.importAndRig(body)}
          />
        )}
      </QueryView>
    </Dialog>
  );
}

type BodyProps = {
  preview: ImportPreview;
  onKind: (kind: string) => void;
  onStatic: () => Promise<void>;
  onRig: () => Promise<void>;
};

function ImportBody({ preview, onKind, onStatic, onRig }: BodyProps) {
  return (
    <>
      <Segmented
        items={preview.kinds.map((kind) => ({
          label: kind.label,
          active: kind.id === preview.kind,
          onSelect: () => onKind(kind.id),
        }))}
      />
      <div className="grid grid-cols-[200px_minmax(0,1fr)] items-center gap-4 rounded-card bg-control p-3.5">
        <div
          role="img"
          aria-label={`Preview of ${preview.file.name}`}
          className="h-35 rounded-card-sm bg-control-raised"
        />
        <div className="flex flex-col gap-1.5">
          <span className="font-semibold">{preview.file.name}</span>
          <span className="text-ui text-fg-secondary">{preview.file.facts}</span>
          <StatusPill tone="ok">{preview.file.detected}</StatusPill>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {preview.steps.map((step) => (
          <CheckLine key={step} item={{ text: step, tone: "ok" }} />
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <ActionButton cta="Import as static mesh" to="SCR-WORLD" run={onStatic} className={buttonClass("secondary")}>
          Import as static mesh
        </ActionButton>
        <ActionButton cta="Import and auto-rig" to="MOD-AUTO-RIG" run={onRig} className={buttonClass("primary")}>
          Import and auto-rig
        </ActionButton>
      </div>
      <p className="text-meta text-fg-tertiary">{preview.formats}</p>
    </>
  );
}
