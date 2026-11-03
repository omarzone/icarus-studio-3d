// MOD-MOTION-VIDEO
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Upload } from "lucide-react";
import { useRef } from "react";
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
import { videoFrames } from "../copilot/attachment-reading.ts";
import { MOTION_SECONDS, MOTION_SIDE, motionFrameTimes, videoProblem } from "./motion-frames.ts";

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
  const update = { onSuccess: (next: VideoSource) => client.setQueryData(key, next) };
  const choose = useEngineAction(port.setVideoChoice);
  const add = useEngineAction(async (file: File) => {
    const problem = videoProblem(file);
    if (problem) {
      throw new Error(problem);
    }
    const stills = await videoFrames(file, motionFrameTimes, MOTION_SIDE);
    const covered = motionFrameTimes(stills.duration).length;
    const seconds = Math.min(stills.duration, MOTION_SECONDS);
    return port.addVideo({
      clip,
      video: {
        name: file.name,
        duration: stills.duration,
        fps: covered / seconds,
        width: stills.width,
        height: stills.height,
        frames: stills.frames,
      },
    });
  });
  const onChoose = (field: Field, id: string) => choose.mutate({ clip, field, id }, update);
  const video = query.data;
  const blocked = !video?.hasVideo
    ? "Choose a video first"
    : !video.poseModel
      ? "Connect a pose model first"
      : undefined;
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
            disabled={blocked !== undefined}
            title={blocked}
            className={dialogButtonClass("primary")}
          >
            Track the motion
          </ActionButton>
        </>
      }
    >
      <QueryView query={query}>
        {(source) => (
          <VideoBody
            video={source}
            reading={add.isPending}
            onPick={(file) => add.mutate(file, update)}
            onChoose={onChoose}
          />
        )}
      </QueryView>
    </Dialog>
  );
}

type BodyProps = {
  video: VideoSource;
  reading: boolean;
  onPick: (file: File) => void;
  onChoose: (field: Field, id: string) => void;
};

function VideoBody({ video, reading, onPick, onChoose }: BodyProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Segmented
        items={video.sources.map((source) => ({
          label: source.label,
          active: source.id === video.source,
          onSelect: () => onChoose("source", source.id),
        }))}
      />
      {video.poseModel ? null : (
        <div role="alert" className="flex items-center gap-3 rounded-card bg-banner-warn px-3.5 py-3 text-body">
          <span className="flex-1">
            Tracking needs a pose model. Connect one in Settings to copy motion from a video.
          </span>
          <GoTo to="SCR-SETTINGS-MODELS" cta="Connect a pose model" className={dialogButtonClass("secondary")}>
            Connect a pose model
          </GoTo>
        </div>
      )}
      <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-3.5 rounded-card bg-control p-3">
        <Act
          cta="Choose video"
          aria-label={`Choose a video to copy, now ${video.file.name}`}
          disabled={reading}
          onClick={() => input.current?.click()}
          className="flex h-37.5 flex-col items-center justify-center gap-1.5 rounded-card-sm bg-app text-meta text-fg-secondary hover:bg-fill-hover hover:text-fg active:opacity-80"
        >
          <Upload size={20} strokeWidth={1.75} aria-hidden />
          {reading ? "Reading the video…" : "Choose video"}
        </Act>
        <input
          ref={input}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) {
              onPick(file);
            }
          }}
        />
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
