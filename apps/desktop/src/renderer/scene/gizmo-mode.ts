// What dragging the selected object does in the editable 3D view.
export type GizmoMode = "move" | "rotate" | "scale";

type Key = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean };

const KEYS: Readonly<Record<string, GizmoMode>> = { w: "move", e: "rotate", r: "scale" };

// W, E and R pick move, rotate and scale, as in most 3D editors; with a modifier they stay shortcuts of the app.
export function gizmoForKey({ key, ctrlKey, metaKey, altKey }: Key): GizmoMode | null {
  if (ctrlKey || metaKey || altKey) {
    return null;
  }
  return KEYS[key.toLowerCase()] ?? null;
}
