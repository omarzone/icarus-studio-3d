import type { SceneGeom } from "@icarus/contracts";
import { isGround } from "./ground-geom.ts";

// Scene colors come from the design tokens, read once from the document so the 3D view matches the theme.
export type SceneColors = {
  background: string;
  grid: string;
  gridStrong: string;
  selected: string;
  proposal: string;
  goal: string;
  spawn: string;
  // A rectangular spot whose rules do not hold yet.
  spot: string;
};

// Three.js reads #rrggbb only; tokens with an alpha channel (#rrggbbaa) keep their color and drop the alpha.
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return /^#[0-9a-f]{8}$/i.test(value) ? value.slice(0, 7) : value || fallback;
}

export function sceneColors(): SceneColors {
  return {
    background: token("--ic-bg-panel", "black"),
    grid: token("--ic-line-subtle", "gray"),
    gridStrong: token("--ic-line", "gray"),
    selected: token("--ic-selected", "white"),
    proposal: token("--ic-proposal", "lightblue"),
    goal: token("--ic-ok", "green"),
    spawn: token("--ic-fg-secondary", "white"),
    spot: token("--ic-danger-graphic", "red"),
  };
}

// Ghosted proposed objects (tokens: scene.proposal is color.proposal at 0.45).
export const PROPOSAL_OPACITY = 0.45;

// Task zones painted on the ground (tokens: scene.zone is color.ok or fg.secondary at 0.3).
export const ZONE_OPACITY = 0.3;
// A spot's outline is paint on the ground, solid enough to read from above (tokens: scene.spot is 0.9).
export const SPOT_OPACITY = 0.9;

export const AMBIENT_INTENSITY = 0.5;

export type DepthOffset = { polygonOffset?: boolean; polygonOffsetFactor?: number; polygonOffsetUnits?: number };

// The grid sits 1 mm above the floor; without an offset the depth buffer cannot separate them and the ground flickers.
export function floorDepth(geom: Pick<SceneGeom, "shape" | "ground">): DepthOffset {
  return isGround(geom) ? { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 } : {};
}
