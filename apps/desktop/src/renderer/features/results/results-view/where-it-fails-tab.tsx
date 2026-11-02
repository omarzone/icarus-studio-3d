// TAB-WHERE-IT-FAILS
import { ScanEye } from "lucide-react";
import { ViewportSurface } from "../../../editor/viewport/viewport-surface.tsx";
import type { FailureReplay } from "../../../ports/results-port.ts";
import { PlaybackBar } from "../../../ui/playback-bar.tsx";

// Replay of a failing test run with the copilot's explanation, and a scrubber over the failing runs.
export function WhereItFailsTab({ replay }: { replay: FailureReplay }) {
  if (replay.frames) {
    return <FailureFrames replay={replay} frames={replay.frames} />;
  }
  return (
    <div className="flex h-full flex-col">
      <ViewportSurface
        label={`Replay of ${replay.run}`}
        overlays={
          <>
            <div className="absolute top-3 left-3 flex items-center gap-2 rounded-card-sm bg-overlay px-3 py-2">
              <ScanEye size={16} strokeWidth={1.75} aria-hidden />
              {replay.watched}
            </div>
            <div className="absolute top-[46%] left-[14%] flex max-w-65 flex-col gap-0.75 rounded-card-sm bg-overlay px-3 py-2">
              <span className="font-semibold text-danger">{replay.note.title}</span>
              <span className="text-ui text-fg-secondary">{replay.note.detail}</span>
            </div>
          </>
        }
      />
      <div className="border-t border-line-subtle px-3 py-2.5">
        <PlaybackBar at={replay.at} played={replay.played} marker={replay.played} chip={replay.run} />
      </div>
    </div>
  );
}

type Frames = NonNullable<FailureReplay["frames"]>;

// On the engine: pictures of the group's evaluation episodes with what they have in common.
function FailureFrames({ replay, frames }: { replay: FailureReplay; frames: Frames }) {
  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex flex-col gap-1 rounded-card-sm bg-control px-3 py-2.5">
        <span className="flex items-center gap-2 text-meta text-fg-tertiary">
          <ScanEye size={14} strokeWidth={1.75} aria-hidden />
          {replay.watched} · {replay.run}
        </span>
        <span className="font-semibold text-danger">{replay.note.title}</span>
        <span className="text-ui leading-normal text-fg-secondary">{replay.note.detail}</span>
      </div>
      {frames.length === 0 ? (
        <p className="text-ui text-fg-tertiary">No pictures were rendered for this group.</p>
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2 overflow-auto">
          {frames.map((frame, index) => (
            <img
              key={frame.id}
              src={frame.url}
              alt={`${replay.note.title}, frame ${index + 1}`}
              className="aspect-video w-full rounded-card-sm bg-panel object-cover"
            />
          ))}
        </div>
      )}
    </div>
  );
}
