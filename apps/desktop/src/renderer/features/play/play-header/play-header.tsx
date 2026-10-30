// HDR-PLAY
import { tokens } from "@icarus/ui-tokens";
import { ChevronDown, CircleDot, Square } from "lucide-react";
import type { ScreenId } from "../../../app/navigation/catalog-id.ts";
import { GoTo } from "../../../app/navigation/go-to.tsx";
import { useNavigation } from "../../../app/navigation/navigation-store.tsx";
import { useTitleBarHeight, WindowControlsSpace } from "../../../app/shell/window-frame.tsx";
import { buttonClass } from "../../../ui/button-styles.ts";

type Props = {
  project: string;
  // Workspace Stop returns to when Play was opened directly (gallery, a link from a dialog).
  returnTo: ScreenId;
};

// Replaces the workspace header while playing; Stop returns to the workspace Play was started from.
export function PlayHeader({ project, returnTo }: Props) {
  useTitleBarHeight(tokens.size.headerWorkspace);
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
          className="flex h-8 items-center gap-2 rounded-full bg-ok-tint px-3.5 text-ui font-semibold text-ok"
        >
          <span aria-hidden className="size-2 rounded-full bg-ok" />
          Playing · nothing you do here changes the project
        </span>
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
      <GoTo to="SCR-TIMELAPSE" cta="Record" title="Save a clip of this session" className={buttonClass("secondary")}>
        <CircleDot size={13} strokeWidth={1.75} aria-hidden />
        Record
      </GoTo>
      <WindowControlsSpace side="end" />
    </header>
  );
}
