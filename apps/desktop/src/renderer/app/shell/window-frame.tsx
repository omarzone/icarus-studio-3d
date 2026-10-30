import { tokens } from "@icarus/ui-tokens";
import { useEffect } from "react";

export function useTitleBarHeight(height: number): void {
  useEffect(() => {
    window.icarus.window.setTitleBarHeight(height);
  }, [height]);
}

// The OS draws the window controls over the header: traffic lights at the start on macOS, caption buttons at the end elsewhere.
export function WindowControlsSpace({ side }: { side: "start" | "end" }) {
  const controlsAtStart = window.icarus.window.platform === "darwin";
  if ((side === "start") !== controlsAtStart) {
    return null;
  }
  return <div aria-hidden className={side === "start" ? "w-15 shrink-0" : "window-controls-end shrink-0"} />;
}

export function WindowDragArea() {
  useTitleBarHeight(tokens.size.headerLauncher);
  return <div aria-hidden className="title-bar absolute inset-x-0 top-0 h-14" />;
}
