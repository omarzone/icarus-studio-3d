// MOD-MOTION-VIDEO
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useRef, useState } from "react";
import { GoTo } from "../../app/navigation/go-to.tsx";
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
import { MOTION_SECONDS, MOTION_SIDE, motionFrameTimes, partStart, videoProblem } from "./motion-frames.ts";
import { PartPicker, VideoPreview } from "./video-preview.tsx";

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
  const [picked, setPicked] = useState<File | null>(null);
  const [draft, setDraft] = useState<number | null>(null);
  const add = useEngineAction(async ({ file, start }: { file: File; start: number }) => {
    const problem = videoProblem(file);
    if (problem) {
      throw new Error(problem);
    }
    const stills = await videoFrames(file, (duration) => motionFrameTimes(duration, start), MOTION_SIDE);
    const from = partStart(stills.duration, start);
    const covered = motionFrameTimes(stills.duration, from).length;
    const seconds = Math.min(stills.duration - from, MOTION_SECONDS);
    return port.addVideo({
      clip,
      video: {
        name: file.name,
        duration: stills.duration,
        start: from,
        fps: covered / seconds,
        width: stills.width,
        height: stills.height,
        frames: stills.frames,
      },
    });
  });
  const sample = (file: File, start: number) =>
    add.mutate({ file, start }, { onSuccess: update.onSuccess, onSettled: () => setDraft(null) });
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
            picked={picked}
            start={draft ?? source.start}
            reading={add.isPending}
            onPick={(file) => {
              setPicked(file);
              sample(file, 0);
            }}
            onDraft={setDraft}
            onPart={(start) => (picked ? sample(picked, start) : undefined)}
            onChoose={onChoose}
          />
        )}
      </QueryView>
    </Dialog>
  );
}

type BodyProps = {
  video: VideoSource;
  picked: File | null;
  start: number;
  reading: boolean;
  onPick: (file: File) => void;
  onDraft: (start: number) => void;
  onPart: (start: number) => void;
  onChoose: (field: Field, id: string) => void;
};

function VideoBody({ video, picked, start, reading, onPick, onDraft, onPart, onChoose }: BodyProps) {
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
        <VideoPreview
          video={video}
          picked={picked}
          start={start}
          reading={reading}
          onChoose={() => input.current?.click()}
        />
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
          <PartPicker
            video={video}
            picked={picked}
            start={start}
            reading={reading}
            onDraft={onDraft}
            onCommit={onPart}
          />
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
