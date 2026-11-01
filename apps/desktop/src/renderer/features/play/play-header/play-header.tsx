// HDR-PLAY
import { tokens } from "@icarus/ui-tokens";
import { BrainCircuit, ChevronDown, CircleDot, Square } from "lucide-react";
import type { ScreenId } from "../../../app/navigation/catalog-id.ts";
import { Act, GoTo } from "../../../app/navigation/go-to.tsx";
import { useNavigation } from "../../../app/navigation/navigation-store.tsx";
import { useNotices } from "../../../app/runtime/notices.ts";
import { useRuntimeMode } from "../../../app/runtime/port.tsx";
import { useTitleBarHeight, WindowControlsSpace } from "../../../app/shell/window-frame.tsx";
import { buttonClass } from "../../../ui/button-styles.ts";

type Props = {
  project: string;
  // Workspace Stop returns to when Play was opened directly (gallery, a link from a dialog).
  returnTo: ScreenId;
  // Which brain is playing, in words from the engine ("Trained brain: Run 3 at 200,000 steps"); app only.
  brain?: string;
};

const PLAYING_PURPOSE =
  "Try it live: watch the current brain act in the world and poke it with tools; nothing changes the project";
const RECORD_PENDING = "Record: save a clip of this session. Not available yet.";

// Replaces the workspace header while playing; Stop returns to the workspace Play was started from.
export function PlayHeader({ project, returnTo, brain }: Props) {
  useTitleBarHeight(tokens.size.headerWorkspace);
  const app = useRuntimeMode() === "app";
  const notify = useNotices((state) => state.notify);
  const previous = useNavigation((state) => state.history.at(-1));
  const stopTo = previous?.screen ?? returnTo;
  return (
    <header data-ui-id="HDR-PLAY" className="title-bar col-span-full flex h-13 items-center gap-3.5 pr-3.5 pl-4.5">
      <WindowControlsSpace side="start" />
      <GoTo
        to="POP-PROJECT-MENU"
        cta={project}
        className="flex h-8 items-center gap-2 rounded-button px-2 text-[14px] font-semibold hover:bg-fill-hover active:opacity-80"
      >
        {project}
        <ChevronDown size={12} strokeWidth={1.75} className="text-fg-tertiary" aria-hidden />
      </GoTo>
      <div className="mx-auto flex items-center gap-2.5">
        <span
          role="status"
          title={PLAYING_PURPOSE}
          className="flex h-8 items-center gap-2 rounded-full bg-ok-tint px-3.5 text-ui font-semibold text-ok"
        >
          <span aria-hidden className="size-2 rounded-full bg-ok" />
          Playing · nothing you do here changes the project
        </span>
        {brain ? <BrainChip brain={brain} /> : null}
        <GoTo
          to={stopTo}
          cta="Stop"
          params={previous?.params}
          title="Back to the workspace, exactly as you left it"
          className={buttonClass("primary", "px-3.5!")}
        >
          <Square size={12} strokeWidth={1.75} aria-hidden />
          Stop
        </GoTo>
      </div>
      {app ? (
        <Act
          cta="Record"
          aria-disabled
          title={RECORD_PENDING}
          onClick={() => notify({ title: "Recording is not available yet", detail: "Saving a clip of a Play session" })}
          className={buttonClass("secondary", "opacity-35 hover:bg-control")}
        >
          <CircleDot size={13} strokeWidth={1.75} aria-hidden />
          Record
        </Act>
      ) : (
        <GoTo to="SCR-TIMELAPSE" cta="Record" title="Save a clip of this session" className={buttonClass("secondary")}>
          <CircleDot size={13} strokeWidth={1.75} aria-hidden />
          Record
        </GoTo>
      )}
      <WindowControlsSpace side="end" />
    </header>
  );
}

// Which brain Play runs, so it is clear whether this is the untrained brain or the result of a run.
function BrainChip({ brain }: { brain: string }) {
  const trained = brain.startsWith("Trained");
  return (
    <span className="flex items-center gap-2">
      <span
        title="Play runs the best trained brain of this revision, or random actions until a run beats them"
        className="flex h-8 max-w-100 items-center gap-2 rounded-full bg-control px-3.5 text-ui"
      >
        <BrainCircuit size={14} strokeWidth={1.75} className="shrink-0 text-fg-secondary" aria-hidden />
        <span className="truncate">{brain}</span>
      </span>
      {trained ? null : (
        <GoTo
          to="MOD-START-TRAINING"
          cta="Train it"
          title="Practice: the brain learns over many tries in parallel copies"
          className={buttonClass("ghost")}
        >
          Train it
        </GoTo>
      )}
    </span>
  );
}
