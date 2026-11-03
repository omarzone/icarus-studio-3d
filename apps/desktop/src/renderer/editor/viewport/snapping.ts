// Snap steps of the World toolbar, as in block building editors: null leaves the gizmo free.
export const MOVE_STEPS = [null, 0.25, 0.5, 1, 2] as const;
export const ROTATE_STEPS = [null, 15, 45, 90] as const;
export const GRID_CELLS = [0.25, 0.5, 1, 2, 5] as const;

export type MoveStep = (typeof MOVE_STEPS)[number];
export type RotateStep = (typeof ROTATE_STEPS)[number];
// "auto" lets the view decide (hidden where a ground slab already shows the floor), "on" and "off" are the user's.
export type GridMode = "auto" | "on" | "off";

export function stepLabel(step: number | null, unit: "m" | "°"): string {
  if (step === null) {
    return "Off";
  }
  return unit === "°" ? `${step}°` : `${step} m`;
}
