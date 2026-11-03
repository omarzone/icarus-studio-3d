import { Pause, Play } from "lucide-react";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import type { Timelapse } from "../../ports/results-port.ts";
import { buttonClass } from "../../ui/button-styles.ts";

const SCRUB_STEPS = 1000;

// The run's checkpoints in order; the one playing is outlined.
export function CheckpointStrip({ timelapse, onSelect }: { timelapse: Timelapse; onSelect: (id: string) => void }) {
  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${timelapse.frames.length}, minmax(0, 1fr))` }}>
      {timelapse.frames.map((frame) => {
        const current = frame.id === timelapse.current;
        return (
          <Act
            key={frame.id}
            cta={frame.label}
            aria-current={current ? "true" : undefined}
            onClick={() => onSelect(frame.id)}
            className={`overflow-hidden rounded-card-sm text-left ${
              current ? "shadow-[0_0_0_2px_var(--ic-fg)]" : "opacity-75 hover:opacity-100 active:opacity-90"
            }`}
          >
            <span className="block truncate bg-overlay px-2 py-1.5 text-ui">{frame.label}</span>
          </Act>
        );
      })}
    </div>
  );
}

type BarProps = {
  played: number;
  at: string;
  length: string;
  playing: boolean;
  onToggle: () => void;
  onScrub?: (share: number) => void;
  // Saves the playing checkpoint's episode; without it the button leads to the Build workspace.
  onExport?: () => void;
  exporting?: boolean;
};

export function TimelapseBar({ played, at, length, playing, onToggle, onScrub, onExport, exporting }: BarProps) {
  const exportClass = buttonClass("primary", "h-8.5! px-4! text-body! disabled:opacity-60");
  return (
    <div className="flex items-center gap-3.5">
      <Act
        cta="Play timelapse"
        aria-label={playing ? "Pause" : "Play"}
        onClick={onToggle}
        className="grid size-10 place-items-center rounded-full bg-selected text-on-selected hover:opacity-90 active:opacity-80"
      >
        {playing ? (
          <Pause size={10} fill="currentColor" aria-hidden />
        ) : (
          <Play size={10} fill="currentColor" aria-hidden />
        )}
      </Act>
      {onScrub ? (
        <input
          type="range"
          data-cta="scrub-the-timelapse"
          aria-label="Scrub the timelapse"
          min={0}
          max={SCRUB_STEPS}
          value={Math.round(played * SCRUB_STEPS)}
          onChange={(event) => onScrub(Number(event.currentTarget.value) / SCRUB_STEPS)}
          className="h-1 min-w-0 flex-1 accent-fg hover:opacity-90 active:opacity-80"
        />
      ) : (
        <span className="h-1 flex-1 rounded-bar bg-fill-track-off">
          <span className="block h-1 rounded-bar bg-fg" style={{ width: `${played * 100}%` }} />
        </span>
      )}
      <span className="font-mono text-ui">
        {at} / {length}
      </span>
      {onExport ? (
        <Act
          cta="Export video"
          title="Save this checkpoint's episode as an animated picture"
          disabled={exporting}
          onClick={onExport}
          className={exportClass}
        >
          {exporting ? "Exporting…" : "Export video"}
        </Act>
      ) : (
        <GoTo to="SCR-BUILD" cta="Export video" className={exportClass}>
          Export video
        </GoTo>
      )}
    </div>
  );
}
