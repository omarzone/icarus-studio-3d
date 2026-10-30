// HDR-WORKSPACE
import { tokens } from "@icarus/ui-tokens";
import { ChevronDown, Play } from "lucide-react";
import { useTitleBarHeight, WindowControlsSpace } from "../window-frame.tsx";

const WORKSPACES = ["World", "Body", "Brain", "Train", "Results", "Build"] as const;

type Props = { project: string; active: (typeof WORKSPACES)[number]; primary: string };

export function WorkspaceHeader({ project, active, primary }: Props) {
  useTitleBarHeight(tokens.size.headerWorkspace);
  return (
    <header data-ui-id="HDR-WORKSPACE" className="title-bar col-span-full flex h-13 items-center gap-3.5 pr-3.5 pl-4.5">
      <WindowControlsSpace side="start" />
      <span data-cta="project-menu" className="flex items-center gap-2 text-[14px] font-semibold">
        {project}
        <ChevronDown size={12} strokeWidth={1.75} className="text-fg-tertiary" aria-hidden />
      </span>
      <div className="mx-auto flex items-center gap-2">
        <div className="flex gap-0.5 rounded-button bg-control p-[3px]">
          {WORKSPACES.map((name) => (
            <span
              key={name}
              data-cta={name.toLowerCase()}
              className={
                name === active
                  ? "rounded-control bg-selected px-3.5 py-1.5 text-ui font-semibold text-on-selected"
                  : "rounded-control px-3.5 py-1.5 text-ui text-fg-tertiary"
              }
            >
              {name}
            </span>
          ))}
        </div>
        <span
          data-cta="play"
          className="flex h-8 items-center gap-1.5 rounded-button bg-control px-3 text-ui font-semibold"
        >
          <Play size={10} fill="currentColor" aria-hidden />
          Play
        </span>
      </div>
      <span data-cta="share" className="flex h-8 items-center rounded-button bg-control px-3.5 text-ui">
        Share
      </span>
      <span
        data-cta="primary"
        className="flex h-8 items-center rounded-button bg-selected px-4 text-ui font-semibold text-on-selected"
      >
        {primary}
      </span>
      <WindowControlsSpace side="end" />
    </header>
  );
}
