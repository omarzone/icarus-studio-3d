import type { SceneSky } from "@icarus/contracts";

// How the finished image is graded: exposure before tone mapping, then brightness, contrast and saturation as a CSS
// filter over the canvas and a tint it is multiplied by. A neutral grade leaves the canvas untouched.
export type ImageGrade = {
  // Tone mapping exposure, 1 unchanged.
  exposure: number;
  filter: string | undefined;
  tint: string | null;
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MAX_STOPS = 3;

const clamp = (value: number | undefined, low: number, high: number) => Math.min(high, Math.max(low, value ?? 0));

export function imageGrade(sky: SceneSky | null | undefined): ImageGrade {
  const stops = clamp(sky?.exposure, -MAX_STOPS, MAX_STOPS);
  const steps = [
    ["brightness", clamp(sky?.brightness, -1, 1)],
    ["contrast", clamp(sky?.contrast, -1, 1)],
    ["saturate", clamp(sky?.saturation, -1, 1)],
  ] as const;
  const filter = steps
    .filter(([, amount]) => amount !== 0)
    .map(([name, amount]) => `${name}(${Number((1 + amount).toFixed(3))})`)
    .join(" ");
  const tint = sky?.tint && HEX_COLOR.test(sky.tint) && sky.tint.toLowerCase() !== "#ffffff" ? sky.tint : null;
  return { exposure: 2 ** stops, filter: filter || undefined, tint };
}
