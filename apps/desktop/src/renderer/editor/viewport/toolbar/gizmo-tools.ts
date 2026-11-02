import type { GizmoMode } from "../../../scene/gizmo-mode.ts";
import { useGizmoMode } from "../gizmo-store.ts";

const TOOL_MODES: Readonly<Record<string, GizmoMode>> = { Move: "move", Rotate: "rotate", Scale: "scale" };

// The Move, Rotate and Scale tools: the selected one follows the 3D view's gizmo mode, W/E/R included.
export function useGizmoTools(): { actions: Readonly<Record<string, () => void>>; active: string } {
  const mode = useGizmoMode((state) => state.mode);
  const setMode = useGizmoMode((state) => state.setMode);
  const entries = Object.entries(TOOL_MODES);
  return {
    actions: Object.fromEntries(entries.map(([label, tool]) => [label, () => setMode(tool)])),
    active: entries.find(([, tool]) => tool === mode)?.[0] ?? "Move",
  };
}
