import type { ListOption } from "../../../ports/scene-port.ts";
import { grainImage } from "../../../scene/surface-grain.ts";
import { type MaterialPreset, paletteLook } from "../../../scene/visual-styles/palette-look.ts";

// The palette materials in the order the engine lists them, plus "custom", which keeps the part's own finish.
const PRESETS: ReadonlySet<string> = new Set<MaterialPreset>([
  "plastic",
  "smooth_plastic",
  "wood",
  "wood_planks",
  "brick",
  "cobblestone",
  "concrete",
  "metal",
  "diamond_plate",
  "corroded_metal",
  "grass",
  "sand",
  "ground",
  "ice",
  "glass",
  "neon",
  "marble",
  "granite",
  "fabric",
  "foil",
]);

export function isMaterialPreset(value: string): value is MaterialPreset {
  return PRESETS.has(value);
}

// A list of palette materials shows as the palette rather than a plain list.
export function isPaletteList(options: readonly ListOption[]): boolean {
  return (
    options.some((option) => isMaterialPreset(option.value)) &&
    options.every((option) => option.value === "custom" || isMaterialPreset(option.value))
  );
}

// The pattern a material's swatch shows (null for plain ones: custom, glass, neon, smooth plastic).
export function swatchGrain(preset: string) {
  return isMaterialPreset(preset) ? (paletteLook(preset).grain ?? null) : null;
}

const images = new Map<string, string | null>();

// A data URL of the material's grey pattern, multiplied by the part's color where it is shown; drawn once per material.
export function swatchImage(preset: string): string | null {
  const cached = images.get(preset);
  if (cached !== undefined) {
    return cached;
  }
  const grain = swatchGrain(preset);
  const made = grain ? drawn(grain) : null;
  images.set(preset, made);
  return made;
}

function drawn(grain: NonNullable<ReturnType<typeof swatchGrain>>): string | null {
  const image = grainImage(grain);
  const canvas = document.createElement("canvas");
  canvas.width = image.size;
  canvas.height = image.size;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  context.putImageData(new ImageData(new Uint8ClampedArray(image.pixels), image.size, image.size), 0, 0);
  return canvas.toDataURL();
}
