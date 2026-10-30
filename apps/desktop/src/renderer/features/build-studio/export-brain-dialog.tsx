// MOD-EXPORT-BRAIN
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Act, CloseOverlay, useCloseOverlay } from "../../app/navigation/go-to.tsx";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { buildPort, type ExportPlan } from "../../ports/build-port.ts";
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
      <p className="rounded-card-sm bg-control px-3.5 py-3 font-mono text-ui leading-[1.7]">
        {plan.file.name} · {fileSize(plan.file.bytes)}
        <br />
        inputs: {plan.file.inputs} · outputs: {plan.file.outputs} · {plan.file.rateHz} Hz
      </p>
    </>
  );
}

function ExportFooter({ project, ready }: { project: string; ready: boolean }) {
  const port = usePort(buildPort);
  const download = useEngineAction(port.downloadExport);
  const close = useCloseOverlay();
  const screen = useNavigation((state) => state.screen);
  return (
    <>
      <CloseOverlay cta="Cancel" className={dialogButton("secondary")}>
        Cancel
      </CloseOverlay>
      <Act
        cta="Download"
        data-goes-to={screen}
        disabled={!ready}
        title={ready ? undefined : "The export is not ready yet"}
        onClick={() => download.mutate(project, { onSuccess: close })}
        className={dialogButton("primary")}
      >
        Download
      </Act>
    </>
  );
}
