// TAB-WHERE-IT-FAILS
import { ScanEye } from "lucide-react";
import { ViewportSurface } from "../../../editor/viewport/viewport-surface.tsx";
import type { FailureReplay } from "../../../ports/results-port.ts";
import { PlaybackBar } from "../../../ui/playback-bar.tsx";

// Replay of a failing test run with the copilot's explanation, and a scrubber over the failing runs.
export function WhereItFailsTab({ replay }: { replay: FailureReplay }) {
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
