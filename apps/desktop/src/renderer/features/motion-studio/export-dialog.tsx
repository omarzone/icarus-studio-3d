// MOD-EXPORT-ANIMATION
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";
import { CloseOverlay } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type AnimationExport, motionPort } from "../../ports/motion-port.ts";
import { ActionButton } from "../../ui/action-button.tsx";
import { Dialog } from "../../ui/dialog.tsx";
import { dialogButtonClass } from "../../ui/dialog-button.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { Segmented } from "../../ui/segmented.tsx";
import { Switch } from "../../ui/switch.tsx";
import { TextField } from "../../ui/text-field.tsx";

const CLIP = "dance-copy";

// Export the motion as an animation file: format, physics result or raw pose, root motion, loop and target rig.
export function ExportDialog() {
  const port = usePort(motionPort);
  const client = useQueryClient();
  const key = ["motion", CLIP, "export"] as const;
  const query = useQuery({ queryKey: key, queryFn: () => port.getExport(CLIP) });
  const update = { onSuccess: (next: AnimationExport) => client.setQueryData(key, next) };
  const setFormat = useEngineAction(port.setExportFormat);
  const toggle = useEngineAction(port.toggleExportOption);
  return (
    <Dialog
      title="Export animation"
      width="w-125"
      footer={
        <>
          <CloseOverlay cta="Cancel" className={dialogButtonClass("secondary")}>
            Cancel
          </CloseOverlay>
          <ActionButton
            cta="Download"
            run={() => port.downloadAnimation(CLIP)}
            disabled={!query.data}
            title={query.data ? undefined : "Available once the export settings load"}
            className={dialogButtonClass("primary")}
          >
            <Download size={14} strokeWidth={1.75} aria-hidden />
            Download
          </ActionButton>
        </>
      }
    >
      <QueryView query={query}>
        {(settings) => (
          <ExportBody
            settings={settings}
            onFormat={(format) => setFormat.mutate({ clip: CLIP, format }, update)}
            onToggle={(id) => toggle.mutate({ clip: CLIP, id }, update)}
          />
        )}
      </QueryView>
    </Dialog>
  );
}

type BodyProps = { settings: AnimationExport; onFormat: (format: string) => void; onToggle: (id: string) => void };

function ExportBody({ settings, onFormat, onToggle }: BodyProps) {
  const [target, setTarget] = useState(settings.target);
  return (
    <>
      <Segmented
        items={settings.formats.map((format) => ({
          label: format,
          active: format === settings.format,
          onSelect: () => onFormat(format),
        }))}
      />
      <div className="flex flex-col gap-2.5">
        {settings.options.map((option) => (
          <span key={option.id} className="flex items-center gap-2.5 text-body">
            <Switch label={option.label} checked={option.on} onChange={() => onToggle(option.id)} />
            {option.label}
          </span>
        ))}
      </div>
      <TextField label="Target" value={target} onChange={(event) => setTarget(event.currentTarget.value)} />
      <div className="rounded-[14px] bg-control px-3.5 py-3 font-mono text-ui leading-[1.7]">
        {settings.summary.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </>
  );
}
