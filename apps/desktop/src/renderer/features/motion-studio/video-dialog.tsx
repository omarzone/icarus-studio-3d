// MOD-MOTION-VIDEO
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { motionPort, type Option, type VideoSource } from "../../ports/motion-port.ts";
import { ActionButton } from "../../ui/action-button.tsx";
import { ChoiceCard } from "../../ui/choice-card.tsx";
import { Dialog } from "../../ui/dialog.tsx";
import { dialogButtonClass } from "../../ui/dialog-button.ts";
import { ProjectDialogGate } from "../../ui/project-dialog-gate.tsx";
import { useProjectKey } from "../../ui/project-name.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { Segmented } from "../../ui/segmented.tsx";

// Sample clip of the gallery and prototype; the app uses the open project's.
const CLIP = "dance-copy";

type Field = "source" | "person" | "target";

// Bring a reference video for a character to copy: who to copy, onto which body, and which part of the clip.
export function VideoDialog() {
  return (
    <ProjectDialogGate projectKey={useProjectKey(CLIP)} title="Copy motion from a video">
      {(clip) => <Video clip={clip} />}
    </ProjectDialogGate>
  );
}

function Video({ clip }: { clip: string }) {
  const port = usePort(motionPort);
  const client = useQueryClient();
  const key = ["motion", clip, "video"] as const;
  const query = useQuery({ queryKey: key, queryFn: () => port.getVideoSource(clip) });
  const choose = useEngineAction(port.setVideoChoice);
  const onChoose = (field: Field, id: string) =>
    choose.mutate({ clip, field, id }, { onSuccess: (next: VideoSource) => client.setQueryData(key, next) });
  return (
    <Dialog
      title="Copy motion from a video"
      width="w-170"
      closeTo="SCR-HOME"
      footer={
        <>
          <GoTo to="SCR-HOME" cta="Cancel" className={dialogButtonClass("secondary")}>
            Cancel
          </GoTo>
          <ActionButton
            cta="Track the motion"
            to="MOD-MOTION-TRACKING"
            run={() => port.trackMotion(clip)}
            className={dialogButtonClass("primary")}
          >
            Track the motion
          </ActionButton>
        </>
      }
    >
      <QueryView query={query}>{(video) => <VideoBody video={video} onChoose={onChoose} />}</QueryView>
    </Dialog>
  );
}

function VideoBody({ video, onChoose }: { video: VideoSource; onChoose: (field: Field, id: string) => void }) {
  return (
    <>
      <Segmented
        items={video.sources.map((source) => ({
          label: source.label,
          active: source.id === video.source,
          onSelect: () => onChoose("source", source.id),
        }))}
      />
      <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-3.5 rounded-card bg-control p-3">
        <div role="img" aria-label={`First frame of ${video.file.name}`} className="h-37.5 rounded-card-sm bg-app" />
        <div className="flex flex-col gap-2">
          <span className="font-semibold">{video.file.name}</span>
          <span className="text-ui text-fg-secondary">{video.file.facts}</span>
          <span className="text-ui text-fg-secondary">Use this part</span>
          <Act
            cta="Use this part"
            aria-label={`Use this part, from ${video.trim.fromLabel} to ${video.trim.toLabel}`}
            className="relative h-7.5 rounded-control bg-control-raised hover:opacity-90"
          >
            <span
              className="absolute inset-y-0 rounded-control bg-fill-ghost shadow-[inset_0_0_0_2px_var(--ic-fg)]"
              style={{ left: `${video.trim.from * 100}%`, right: `${(1 - video.trim.to) * 100}%` }}
            />
          </Act>
          <span className="flex font-mono text-mono text-fg-secondary">
            {video.trim.fromLabel}
            <span className="ml-auto">{video.trim.toLabel}</span>
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Choices
          label="Who to copy"
          options={video.people}
          chosen={video.person}
          onChoose={(id) => onChoose("person", id)}
        />
        <Choices
          label="Copy onto"
          options={video.targets}
          chosen={video.target}
          onChoose={(id) => onChoose("target", id)}
        />
      </div>
      <p className="flex items-center gap-2 text-ui text-fg-secondary">
        <Lock size={14} strokeWidth={1.75} aria-hidden />
        {video.privacy}
      </p>
    </>
  );
}

type ChoicesProps = { label: string; options: readonly Option[]; chosen: string; onChoose: (id: string) => void };

function Choices({ label, options, chosen, onChoose }: ChoicesProps) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
      <span className="text-ui text-fg-secondary">{label}</span>
      {options.map((option) => (
        <ChoiceCard
          key={option.id}
          title={option.title}
          detail={option.detail}
          checked={option.id === chosen}
          to={option.imported ? "MOD-IMPORT" : undefined}
          onSelect={() => onChoose(option.id)}
        />
      ))}
    </div>
  );
}
