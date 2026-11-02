import { create } from "zustand";
import type { GizmoMode } from "../../scene/gizmo-mode.ts";

// The gizmo mode the World toolbar and the 3D view share; view state only, the edits go to the engine.
type GizmoState = { mode: GizmoMode; setMode: (mode: GizmoMode) => void };

export const useGizmoMode = create<GizmoState>()((set) => ({
  mode: "move",
  setMode: (mode) => set({ mode }),
}));
