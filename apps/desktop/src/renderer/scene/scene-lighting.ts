import type { SceneLight } from "@icarus/contracts";
import { toThreePosition, type Vector3 } from "./coordinates.ts";
import type { SkyLook } from "./scene-sky.ts";
import type { SceneBounds } from "./thumbnail-framing.ts";

type Vec3 = [number, number, number];

// Square shadow map of the sun; one map covers every copy of a training run, so it stays sharp for one world and soft
// for sixteen.
export const SHADOW_MAP_SIZE = 2048;
// Blur radius of the shadow edge, in shadow-map texels.
export const SHADOW_SOFTNESS = 3;
export const SHADOW_BIAS = -0.0004;
export const SHADOW_NORMAL_BIAS = 0.03;

// The sun as a shadow-casting Three light: placed back along its direction from the middle of what the scene shows,
// with an orthographic shadow box just big enough to hold it.
export type SunFrame = {
  position: Vec3;
  color: string;
  target: Vec3;
  intensity: number;
  // Half the side of the shadow box, in metres.
  extent: number;
  near: number;
  far: number;
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const EMPTY: SceneBounds = { center: [0, 0, 0], radius: 4 };

export function sunFrame(light: SceneLight, bounds: SceneBounds | null): SunFrame {
  const { center, radius } = bounds ?? EMPTY;
  const [dx, dy, dz] = light.direction;
  const length = Math.hypot(dx, dy, dz) || 1;
  const distance = radius * 2 + 10;
  const from: Vector3 = [
    center[0] - (dx / length) * distance,
    center[1] - (dy / length) * distance,
    center[2] - (dz / length) * distance,
  ];
  return {
    position: toThreePosition(from),
    color: light.color && HEX_COLOR.test(light.color) ? light.color : "#ffffff",
    target: toThreePosition(center),
    intensity: Math.max(light.intensity, 0.2) * 2,
    extent: radius * 1.25 + 1,
    near: 0.5,
    far: distance + radius * 2 + 2,
  };
}

// Sky light from above and bounce light from the ground: the sky's horizon over the ground's own color, as strong as
// the ambient light the world asks for; without a sky, the editor's neutral ambient.
export type HemisphereLook = { sky: string; ground: string; intensity: number };

// `tint` is the sky's ambient color, which multiplies the light from above (white leaves it).
export function hemisphereLook(
  look: SkyLook | null,
  ground: string,
  ambient: number,
  tint = "#ffffff",
): HemisphereLook {
  const sky = look?.horizon ?? "#ffffff";
  return { sky: multiply(sky, tint), ground, intensity: (look?.ambient ?? ambient) * 1.2 };
}

function multiply(color: string, tint: string): string {
  if (!HEX_COLOR.test(tint) || tint.toLowerCase() === "#ffffff" || !HEX_COLOR.test(color)) {
    return color;
  }
  const channels = [1, 3, 5].map((index) => {
    const product =
      (Number.parseInt(color.slice(index, index + 2), 16) * Number.parseInt(tint.slice(index, index + 2), 16)) / 255;
    return Math.round(product).toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

// Which light casts the shadows: the first that allows them, or none when the world turns shadows off.
export function shadowCaster(lights: readonly SceneLight[], worldShadows = true): number {
  return worldShadows ? lights.findIndex((light) => light.shadows !== false) : -1;
}

// Shadow edge blur in shadow-map texels for a softness of 0 to 1; the default softness keeps the old edge.
export function shadowRadius(softness = 0.5): number {
  return 1 + 4 * Math.min(1, Math.max(0, softness));
}

// The color light bounces off: the first ground plane's, or `fallback` in a world without one.
export function groundColor(geoms: readonly { shape: string; color: string }[], fallback: string): string {
  return geoms.find((geom) => geom.shape === "plane")?.color ?? fallback;
}
