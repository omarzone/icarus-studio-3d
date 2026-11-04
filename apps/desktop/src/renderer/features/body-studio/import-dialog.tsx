// MOD-IMPORT
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { bodyPort, type ImportPreview, type ModelFile } from "../../ports/body-port.ts";
import { projectsPort } from "../../ports/projects-port.ts";
import { ActionButton } from "../../ui/action-button.tsx";
import { buttonClass } from "../../ui/button-styles.ts";
import { Dialog } from "../../ui/dialog.tsx";
import { useProjectKey } from "../../ui/project-name.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { Segmented } from "../../ui/segmented.tsx";
import { StatusPill } from "../../ui/status-pill.tsx";
import { readFile } from "../copilot/attachment-reading.ts";
import { checkAttachment, formatBytes } from "../copilot/attachment-rules.ts";
import { CheckLine } from "../copilot/chat-messages.tsx";

const MODEL_FILES = ".glb,.gltf,.obj,.stl";

// Sample body of the gallery and prototype; the app uses the open project's.
const BODY = "dance-copy";

// A picked model: read and ready to send, or why it cannot be imported.
type Picked = { file: ModelFile; facts: string } | { problem: string; name: string } | null;

// Preview key of a dialog opened with no project: import options are the same for every project.
const NO_PROJECT = "";

// Bring a model, environment or robot description in, as a static mesh or rigged for physics. Opens over any screen.
export function ImportDialog() {
  // The project when the dialog opened: one created on confirm must not reload the dialog mid-import.
  const [body] = useState(useProjectKey(BODY));
  return <Import body={body} />;
}

// Opened with no project in the app, confirming creates an empty world named after the file and imports into it.
function Import({ body }: { body: string | null }) {
  const port = usePort(bodyPort);
  const projects = usePort(projectsPort);
  const replaceParams = useNavigation((state) => state.replaceParams);
  const client = useQueryClient();
  const previewKey = body ?? NO_PROJECT;
  const key = ["body", previewKey, "import"] as const;
  const query = useQuery({ queryKey: key, queryFn: () => port.getImport(previewKey) });
  const setKind = useEngineAction(port.setImportKind);
  const [picked, setPicked] = useState<Picked>(null);
  const file = picked && "file" in picked ? picked.file : null;
  const target = async (): Promise<string> => {
    if (body !== null || !file) {
      return body ?? NO_PROJECT;
    }
    const created = await projects.createProject({ template: "empty_world", name: fileStem(file.name) });
    replaceParams({ project: created.id });
    void client.invalidateQueries({ queryKey: ["projects"] });
    return created.id;
  };
  const pick = async (file: File) => {
    const check = checkAttachment({ name: file.name, type: file.type, size: file.size }, 0);
    if (!check.ok || check.kind !== "model") {
      setPicked({
        name: file.name,
        problem: check.ok ? `${file.name} is not a .glb, .gltf, .obj or .stl model` : check.reason,
      });
      return;
    }
    const read = await readFile(file, check);
    setPicked({ file: { name: read.name, data: read.data }, facts: `3D model · ${formatBytes(file.size)}` });
  };
  return (
    <Dialog title="Import" width="w-155">
      <QueryView query={query}>
        {(preview) => (
          <ImportBody
            preview={preview}
            picked={picked}
            onPick={(file) => void pick(file)}
            onKind={(kind) =>
              setKind.mutate({ body: previewKey, kind }, { onSuccess: (next) => client.setQueryData(key, next) })
            }
            onStatic={async () => port.importStatic({ body: await target(), kind: preview.kind, file })}
            onRig={async () => port.importAndRig({ body: await target(), kind: preview.kind, file })}
          />
        )}
      </QueryView>
    </Dialog>
  );
}

function fileStem(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

type BodyProps = {
  preview: ImportPreview;
  picked: Picked;
  onPick: (file: File) => void;
  onKind: (kind: string) => void;
  onStatic: () => Promise<void>;
  onRig: () => Promise<void>;
};

function ImportBody({ preview, picked, onPick, onKind, onStatic, onRig }: BodyProps) {
  const input = useRef<HTMLInputElement>(null);
  const name = picked ? ("file" in picked ? picked.file.name : picked.name) : preview.file.name;
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
        <Act
          cta="Choose file"
          aria-label={`Choose a model to import, now ${name}`}
          onClick={() => input.current?.click()}
          className="flex h-35 flex-col items-center justify-center gap-1.5 rounded-card-sm bg-control-raised text-meta text-fg-secondary hover:bg-fill-hover hover:text-fg active:opacity-80"
        >
          <Upload size={20} strokeWidth={1.75} aria-hidden />
          Choose file
        </Act>
        <input
          ref={input}
          type="file"
          accept={MODEL_FILES}
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) {
              onPick(file);
            }
          }}
        />
        <div className="flex flex-col gap-1.5">
          <span className="font-semibold">{name}</span>
          <span className="text-ui text-fg-secondary">
            {picked ? ("file" in picked ? picked.facts : picked.problem) : preview.file.facts}
          </span>
          <StatusPill tone={picked && "problem" in picked ? "warn" : "ok"}>
            {picked ? ("file" in picked ? "Ready to import" : "Cannot import") : preview.file.detected}
          </StatusPill>
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
