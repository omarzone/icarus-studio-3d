import { Play } from "lucide-react";
import type { ReactNode } from "react";
import { Act } from "../app/navigation/go-to.tsx";

type Props = {
  // Current position and, when known, the length ("0:00.9", "0:01.6").
  at: string;
  length?: string;
  // Share played, from 0 to 1.
  played: number;
  // Where something went wrong, from 0 to 1, marked in red.
  marker?: number;
  // Chip at the end (speed, which test run).
  chip?: ReactNode;
  onPlay?: () => void;
};

// Replay controls: round play button, time, scrub track with an optional failure mark, and a chip.
export function PlaybackBar({ at, length, played, marker, chip, onPlay }: Props) {
  return (
    <div className="flex items-center gap-3">
      <Act
        cta="Play replay"
        aria-label="Play"
        onClick={onPlay}
        className="grid size-8 shrink-0 place-items-center rounded-full bg-selected text-on-selected hover:opacity-90"
      >
        <Play size={10} fill="currentColor" aria-hidden />
      </Act>
      <span className="font-mono text-meta">{at}</span>
      <span className="relative h-1 flex-1 rounded-bar bg-fill-track-off">
        <span className="absolute inset-y-0 left-0 rounded-bar bg-fg" style={{ width: `${played * 100}%` }} />
        {marker === undefined ? null : (
          <span
            aria-hidden
            title="Where it went wrong"
            className="absolute -top-0.75 h-2.5 w-0.5 bg-danger-graphic"
            style={{ left: `${marker * 100}%` }}
          />
        )}
      </span>
      {length ? <span className="font-mono text-meta text-fg-tertiary">{length}</span> : null}
      {chip ? (
        <span className="inline-flex h-6.5 shrink-0 items-center rounded-full bg-fill-hover px-2.5 text-ui text-fg-tool">
          {chip}
        </span>
      ) : null}
    </div>
  );
}
