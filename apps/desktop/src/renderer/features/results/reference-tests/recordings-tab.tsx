// TAB-RECORDINGS
import { Download, Play } from "lucide-react";
import { Act } from "../../../app/navigation/go-to.tsx";
import type { Recording } from "../../../ports/results-port.ts";
import { buttonClass } from "../../../ui/button-styles.ts";

type Props = {
  recordings: readonly Recording[];
  onPlay: (recording: Recording) => void;
  onExport: (recording: Recording) => void;
  exporting: string | null;
};

// Recorded evaluation episodes, one per checkpoint: play one in the timelapse or save it as an animation.
export function RecordingsTab({ recordings, onPlay, onExport, exporting }: Props) {
  return (
    <div className="flex flex-col gap-0.5 p-1.5">
      {recordings.map((recording) => {
        const playable = recording.run !== undefined && recording.step !== undefined;
        return (
          <div key={recording.id} className="flex items-center gap-1.5 rounded-button px-2.5 py-2 hover:bg-fill-hover">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate">{recording.name}</span>
              <span className="truncate text-meta text-fg-tertiary">{recording.detail}</span>
            </div>
            {playable ? (
              <>
                <Act
                  cta="Play recording"
                  aria-label={`Play ${recording.name}`}
                  title="Play it in the timelapse"
                  onClick={() => onPlay(recording)}
                  className={buttonClass("icon", "size-6! text-fg-tertiary!")}
                >
                  <Play size={12} strokeWidth={1.75} aria-hidden />
                </Act>
                <Act
                  cta="Export recording"
                  aria-label={`Export ${recording.name}`}
                  title="Save it as an animated picture"
                  disabled={exporting !== null}
                  onClick={() => onExport(recording)}
                  className={buttonClass("icon", "size-6! text-fg-tertiary! disabled:opacity-50")}
                >
                  <Download size={12} strokeWidth={1.75} aria-hidden />
                </Act>
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
