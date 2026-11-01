import type { SceneGeom, SceneLight } from "@icarus/contracts";
import { toThreePosition } from "./coordinates.ts";

// Scene colors come from the design tokens, read once from the document so the 3D view matches the theme.
export type SceneColors = { background: string; grid: string; gridStrong: string; selected: string; proposal: string };

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
  };
}

// Ghosted proposed objects (tokens: scene.proposal is color.proposal at 0.45).
export const PROPOSAL_OPACITY = 0.45;

export const AMBIENT_INTENSITY = 0.5;
export const GEOM_ROUGHNESS = 0.8;

// A MuJoCo light as a Three directional light: placed back along its direction, never dimmer than a floor.
export function sceneLight(light: SceneLight): { position: [number, number, number]; intensity: number } {
  const [dx, dy, dz] = light.direction;
  return { position: toThreePosition([-dx * 10, -dy * 10, -dz * 10]), intensity: Math.max(light.intensity, 0.2) * 2 };
}

export type DepthOffset = { polygonOffset?: boolean; polygonOffsetFactor?: number; polygonOffsetUnits?: number };

// The grid sits 1 mm above the floor; without an offset the depth buffer cannot separate them and the ground flickers.
export function floorDepth(shape: SceneGeom["shape"]): DepthOffset {
  return shape === "plane" ? { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 } : {};
}
