import { Film } from "lucide-react";
import { useState } from "react";
import { Act } from "../../app/navigation/go-to.tsx";
import type { ChatAttachment, FilmStripView } from "../../ports/copilot-port.ts";
import { ImageViewer } from "./media-viewer.tsx";

// The coach's frame-by-frame look at one episode: a compact row that scrolls sideways, the failure frame outlined.
export function FilmStrip({ strip }: { strip: FilmStripView }) {
  const [opened, setOpened] = useState<ChatAttachment | null>(null);
  return (
    <div className="flex min-w-0 flex-col gap-1.5 self-stretch">
      <p className="flex items-center gap-1 px-1 text-meta text-fg-tertiary">
        <Film size={12} strokeWidth={1.75} aria-hidden />
        Episode {strip.episode + 1} at step {strip.step.toLocaleString("en-US")}, every {strip.interval.toFixed(1)} s
      </p>
      <ul aria-label="Film strip" className="flex min-w-0 gap-1 overflow-x-auto pb-1">
        {strip.frames.map((frame) => (
          <li key={frame.picture.id} className="flex shrink-0 flex-col items-center gap-0.5">
            {frame.picture.url ? (
              <Act
                cta="Open view"
                aria-label={`Open ${frame.picture.name}`}
                onClick={() => setOpened(frame.picture)}
                className={`h-14 w-22 overflow-hidden rounded-control bg-control-raised hover:opacity-90 active:opacity-80 ${
                  frame.failure ? "ring-2 ring-danger" : ""
                }`}
              >
                <img
                  src={frame.picture.url}
                  alt={frame.picture.name}
                  draggable={false}
                  className="size-full object-cover"
                />
              </Act>
            ) : (
              <span className="grid h-14 w-22 place-items-center rounded-control bg-control text-meta text-fg-tertiary">
                Not available
              </span>
            )}
            <span className={`text-meta ${frame.failure ? "text-danger" : "text-fg-tertiary"}`}>
              {frame.time.toFixed(1)} s
            </span>
          </li>
        ))}
      </ul>
      {opened ? <ImageViewer attachment={opened} onClose={() => setOpened(null)} /> : null}
    </div>
  );
}
