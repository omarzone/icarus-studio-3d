import { tokens } from "@icarus/ui-tokens";
import { useTitleBarHeight, WindowControlsSpace } from "../app/shell/window-frame.tsx";

// Title bar of reference boards that have no workspace header: window controls and the board name.
export function BoardTitleBar({ title }: { title: string }) {
  useTitleBarHeight(tokens.size.headerWorkspace);
  return (
    <header className="title-bar flex h-13 shrink-0 items-center gap-3.5 px-4.5">
      <WindowControlsSpace side="start" />
      <span className="ml-3 font-semibold">{title}</span>
      <WindowControlsSpace side="end" />
    </header>
  );
}
