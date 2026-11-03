import type { SceneLight, SceneSky } from "@icarus/contracts";
import { toThreePosition, type Vector3 } from "./coordinates.ts";

// What the sky dome draws beyond its two colors: the sun's disc and glare, haze at the horizon, stars and clouds.
// Every amount is 0 to 1 and 0 draws nothing, so a sky without these fields looks as it always did.
export type DomeExtras = {
  // Unit vector towards the sun (or the moon at night), Three axes.
  sunDirection: [number, number, number];
  // Angular radius of the disc, in radians; 0 hides it.
  sunRadius: number;
  sunColor: string;
  glare: number;
  haze: number;
  stars: number;
  clouds: { cover: number; density: number; color: string };
};

// Where a world sun shines from when the scene has no light, as the engine aims a new one.
const DEFAULT_LIGHT: Vector3 = [0.3, 0.2, -1];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MAX_SUN_DEGREES = 30;

const unit = (value: number | undefined) => Math.min(1, Math.max(0, value ?? 0));
const hex = (value: string | null | undefined, fallback: string) => (value && HEX_COLOR.test(value) ? value : fallback);

export function towardSun(light: SceneLight | undefined): [number, number, number] {
  const [dx, dy, dz] = light?.direction ?? DEFAULT_LIGHT;
  const [x, y, z] = toThreePosition([-dx, -dy, -dz]);
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

export function domeExtras(sky: SceneSky | null | undefined, light: SceneLight | undefined): DomeExtras {
  const degrees = Math.min(MAX_SUN_DEGREES, Math.max(0, sky?.sun_size ?? 0));
  return {
    sunDirection: towardSun(light),
    sunRadius: ((degrees / 2) * Math.PI) / 180,
    sunColor: hex(light?.color, "#ffffff"),
    glare: unit(sky?.glare),
    haze: unit(sky?.haze),
    stars: unit(sky?.stars),
    clouds: {
      cover: unit(sky?.clouds),
      density: unit(sky?.cloud_density ?? 0.7),
      color: hex(sky?.cloud_color, "#ffffff"),
    },
  };
}
