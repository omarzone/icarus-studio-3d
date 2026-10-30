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
      <button
        type="button"
        data-cta="project-menu"
        className="flex h-8 items-center gap-2 rounded-button px-2 text-[14px] font-semibold hover:bg-fill-hover active:opacity-80"
      >
        {project}
        <ChevronDown size={12} strokeWidth={1.75} className="text-fg-tertiary" aria-hidden />
      </button>
      <div className="mx-auto flex items-center gap-2">
        <div className="flex gap-0.5 rounded-button bg-control p-[3px]">
          {WORKSPACES.map((name) => (
            <button
              key={name}
              type="button"
              data-cta={name.toLowerCase()}
              aria-current={name === active ? "page" : undefined}
              className={
                name === active
                  ? "rounded-control bg-selected px-3.5 py-1.5 text-ui font-semibold text-on-selected"
                  : "rounded-control px-3.5 py-1.5 text-ui text-fg-tertiary hover:bg-fill-hover hover:text-fg active:opacity-80"
              }
            >
              {name}
            </button>
          ))}
        </div>
        <button
          type="button"
          data-cta="play"
          className="flex h-8 items-center gap-1.5 rounded-button bg-control px-3 text-ui font-semibold hover:bg-control-raised active:opacity-80"
        >
          <Play size={10} fill="currentColor" aria-hidden />
          Play
        </button>
      </div>
      <button
        type="button"
        data-cta="share"
        className="flex h-8 items-center rounded-button bg-control px-3.5 text-ui hover:bg-control-raised active:opacity-80"
      >
        Share
      </button>
      <button
        type="button"
        data-cta="primary"
        className="flex h-8 items-center rounded-button bg-selected px-4 text-ui font-semibold text-on-selected hover:opacity-90 active:opacity-80"
      >
        {primary}
      </button>
      <WindowControlsSpace side="end" />
    </header>
  );
}
