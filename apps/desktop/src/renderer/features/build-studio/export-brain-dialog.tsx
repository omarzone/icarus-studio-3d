// MOD-EXPORT-BRAIN
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Act, CloseOverlay, useCloseOverlay } from "../../app/navigation/go-to.tsx";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { useNotices } from "../../app/runtime/notices.ts";
import { usePort } from "../../app/runtime/port.tsx";
import { buildPort, type ExportDownload, type ExportPlan } from "../../ports/build-port.ts";
import { Dialog } from "../../ui/dialog.tsx";
import { QueryView } from "../../ui/query-view.tsx";
import { Segmented } from "../../ui/segmented.tsx";
import { Switch } from "../../ui/switch.tsx";
import { DialogTitle, dialogButton } from "./dialog-button.tsx";
import { fileSize } from "./file-size.ts";
import { useBuildProject } from "./use-build-project.ts";

export function ExportBrainDialog() {
  const project = useBuildProject();
  const port = usePort(buildPort);
  const key = ["build", "export", project.id] as const;
  const plan = useQuery({ queryKey: key, queryFn: () => port.getExportPlan(project.id) });
  return (
    <Dialog
      title={<DialogTitle text="Export brain" />}
      width="w-136.5"
      footer={<ExportFooter project={project.id} ready={plan.isSuccess} />}
    >
      <QueryView query={plan}>{(data) => <ExportBody project={project.id} plan={data} />}</QueryView>
    </Dialog>
  );
}

function ExportBody({ project, plan }: { project: string; plan: ExportPlan }) {
  const port = usePort(buildPort);
  const client = useQueryClient();
  const saved = { onSuccess: (next: ExportPlan) => client.setQueryData(["build", "export", project], next) };
  const setFormat = useEngineAction(port.setExportFormat);
  const setOption = useEngineAction(port.setExportOption);
  return (
    <>
      <Segmented
        className="-mt-0.75"
        items={plan.formats.map(({ format, label }) => ({
          label,
          active: format === plan.format,
          onSelect: () => setFormat.mutate({ project, format }, saved),
        }))}
      />
      <div className="flex flex-col gap-2.5">
        {plan.options.map((option) => (
          <div key={option.id} className="flex items-center gap-2.5">
            <Switch
              label={option.label}
              checked={option.on}
              onChange={(on) => setOption.mutate({ project, id: option.id, on }, saved)}
            />
            <span>{option.label}</span>
          </div>
        ))}
      </div>
      <ExportSummary plan={plan} />
    </>
  );
}

// The files the export writes with their real sizes, the brain's shape and what is left out.
function ExportSummary({ plan }: { plan: ExportPlan }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-card-sm bg-control px-3.5 py-3 font-mono text-ui leading-[1.7]">
        <p>
          {plan.name} · {fileSize(plan.totalBytes)}
        </p>
        {plan.brain ? (
          <p>
            inputs: {plan.brain.inputs} · outputs: {plan.brain.outputs} · {plan.brain.rateHz} Hz
          </p>
        ) : null}
        <ul className="text-fg-secondary">
          {plan.files.map((file) => (
            <li key={file.path} title={file.description} className="flex justify-between gap-3">
              <span className="truncate">{file.path}</span>
              <span className="shrink-0">{fileSize(file.bytes)}</span>
            </li>
          ))}
        </ul>
      </div>
      {plan.notes.map((note) => (
        <p key={note} className="text-meta leading-3.5 text-fg-tertiary">
          {note}
        </p>
      ))}
    </div>
  );
}

function ExportFooter({ project, ready }: { project: string; ready: boolean }) {
  const port = usePort(buildPort);
  const download = useEngineAction(port.downloadExport);
  const close = useCloseOverlay();
  const notify = useNotices((state) => state.notify);
  const screen = useNavigation((state) => state.screen);
  const saved = (result: ExportDownload) => {
    if (result.kind === "saved") {
      notify({ title: "Export saved", detail: `${result.path} · ${fileSize(result.bytes)}` });
      close();
    }
  };
  return (
    <>
      <CloseOverlay cta="Cancel" className={dialogButton("secondary")}>
        Cancel
      </CloseOverlay>
      <Act
        cta="Download"
        data-goes-to={screen}
        disabled={!ready || download.isPending}
        title={ready ? undefined : "The export is not ready yet"}
        onClick={() => download.mutate(project, { onSuccess: saved })}
        className={dialogButton("primary")}
      >
        Download
      </Act>
    </>
  );
}
