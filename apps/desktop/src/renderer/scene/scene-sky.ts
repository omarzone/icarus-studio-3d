import type { SceneSky } from "@icarus/contracts";

// How a world's sky draws: a two-color dome, the ambient light it adds and the haze tinted by its horizon.
export type SkyLook = {
  top: string;
  horizon: string;
  ambient: number;
  fog: { color: string; density: number } | null;
};

// Exponential fog density at full haze for one framed world (about 63% hidden 50 m away).
export const FULL_FOG_DENSITY = 0.02;
// Radius of the sky dome for one framed world, inside the camera's far plane.
export const SKY_RADIUS = 400;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

// `scale` is how many single worlds wide the view frames; wider views thin the haze to keep far copies visible.
export function skyLook(sky: SceneSky | null | undefined, scale = 1): SkyLook | null {
  if (!sky || !HEX_COLOR.test(sky.top) || !HEX_COLOR.test(sky.horizon)) {
    return null;
  }
  const haze = clamp(sky.fog, 0, 1);
  return {
    top: sky.top,
    horizon: sky.horizon,
    ambient: clamp(sky.ambient, 0, 2),
    fog: haze > 0 ? { color: sky.horizon, density: (haze * FULL_FOG_DENSITY) / Math.max(1, scale) } : null,
  };
}
