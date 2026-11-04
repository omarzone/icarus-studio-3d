import { Upload } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import type { VideoSource } from "../../ports/motion-port.ts";
import { clock } from "../../ports/motion-views.ts";
import { ClipFrame, useFrameCycle } from "./clip-frame.tsx";
import { partStart } from "./motion-frames.ts";

const KEY_STEP_SECONDS = 1;
const KEY_SETTLE_MS = 500;

function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

type PreviewProps = {
  video: VideoSource;
  // The file picked in this dialog; after reopening only the engine's sampled frames are left.
  picked: File | null;
  start: number;
  reading: boolean;
  onChoose: () => void;
};

// What will be copied: the chosen part of the picked video playing on a loop, else the frames the engine keeps.
export function VideoPreview({ video, picked, start, reading, onChoose }: PreviewProps) {
  const url = useObjectUrl(picked);
  const strip = url ? null : video.strip;
  const index = useFrameCycle(strip?.count ?? 0, strip?.fps ?? 1, strip !== null);
  const end = start + video.span;
  const shown = url !== null || strip !== null;
  return (
    <div className="relative h-37.5 overflow-hidden rounded-card-sm bg-app">
      {url ? (
        <video
          src={url}
          muted
          autoPlay
          playsInline
          aria-label={`Preview of the part from ${clock(start)} to ${clock(end)}`}
          onLoadedMetadata={(event) => {
            event.currentTarget.currentTime = start;
          }}
          onTimeUpdate={(event) => {
            const player = event.currentTarget;
            if (player.currentTime < start - 0.25 || player.currentTime >= end) {
              player.currentTime = start;
              void player.play();
            }
          }}
          onEnded={(event) => {
            event.currentTarget.currentTime = start;
            void event.currentTarget.play();
          }}
          className="size-full object-contain"
        />
      ) : strip ? (
        <ClipFrame strip={strip} index={index} />
      ) : null}
      <Act
        cta="Choose video"
        aria-label={`Choose a video to copy, now ${video.file.name}`}
        disabled={reading}
        onClick={onChoose}
        className={
          shown
            ? "absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-button bg-overlay px-2.5 py-1.25 text-meta text-fg hover:bg-fill-hover active:opacity-80"
            : "flex size-full flex-col items-center justify-center gap-1.5 text-meta text-fg-secondary hover:bg-fill-hover hover:text-fg active:opacity-80"
        }
      >
        <Upload size={shown ? 14 : 20} strokeWidth={1.75} aria-hidden />
        {reading ? "Reading the video…" : "Choose video"}
      </Act>
    </div>
  );
}

type PartProps = {
  video: VideoSource;
  picked: File | null;
  start: number;
  reading: boolean;
  // While dragging or stepping: the part the preview shows. Once settled: the part to sample again.
  onDraft: (start: number) => void;
  onCommit: (start: number) => void;
};

function why(video: VideoSource, picked: File | null): string | undefined {
  if (!video.hasVideo) {
    return "Choose a video first";
  }
  if (video.duration <= video.span) {
    return "The whole video is used";
  }
  return picked ? undefined : "Choose the video again to pick another part of it";
}

// The part of the video to copy: drag the window or use the arrow keys; letting go samples that part again.
export function PartPicker({ video, picked, start, reading, onDraft, onCommit }: PartProps) {
  const blocked = why(video, picked) ?? (reading ? "Reading the video…" : undefined);
  const dragging = useRef(false);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => (settle.current ? clearTimeout(settle.current) : undefined), []);
  const measured = video.duration > 0;
  const from = measured ? start / video.duration : video.trim.from;
  const to = measured ? Math.min(1, (start + video.span) / video.duration) : video.trim.to;
  const at = (event: PointerEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const share = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    return partStart(video.duration, share * video.duration - video.span / 2);
  };
  const step = (event: KeyboardEvent<HTMLButtonElement>) => {
    const move = event.key === "ArrowRight" ? KEY_STEP_SECONDS : event.key === "ArrowLeft" ? -KEY_STEP_SECONDS : 0;
    if (blocked || move === 0) {
      return;
    }
    event.preventDefault();
    const next = partStart(video.duration, start + move);
    onDraft(next);
    if (settle.current) {
      clearTimeout(settle.current);
    }
    settle.current = setTimeout(() => onCommit(next), KEY_SETTLE_MS);
  };
  return (
    <>
      <Act
        cta="Use this part"
        role="slider"
        aria-label={`Use this part, from ${measured ? clock(start) : video.trim.fromLabel} to ${measured ? clock(start + video.span) : video.trim.toLabel}`}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, video.duration - video.span)}
        aria-valuenow={start}
        aria-disabled={blocked !== undefined}
        title={blocked}
        onPointerDown={(event) => {
          if (blocked) {
            return;
          }
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          onDraft(at(event));
        }}
        onPointerMove={(event) => {
          if (dragging.current) {
            onDraft(at(event));
          }
        }}
        onPointerUp={(event) => {
          if (dragging.current) {
            dragging.current = false;
            onCommit(at(event));
          }
        }}
        onKeyDown={step}
        className={`relative h-7.5 rounded-control bg-control-raised hover:opacity-90 ${blocked ? "cursor-default" : "cursor-ew-resize"}`}
      >
        <span
          className="absolute inset-y-0 rounded-control bg-fill-ghost shadow-[inset_0_0_0_2px_var(--ic-fg)]"
          style={{ left: `${from * 100}%`, right: `${(1 - to) * 100}%` }}
        />
      </Act>
      <span className="flex font-mono text-mono text-fg-secondary">
        {measured ? clock(start) : video.trim.fromLabel}
        <span className="ml-auto">{measured ? clock(start + video.span) : video.trim.toLabel}</span>
      </span>
    </>
  );
}
