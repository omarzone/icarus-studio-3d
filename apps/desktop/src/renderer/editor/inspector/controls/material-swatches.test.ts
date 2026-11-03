import type { SceneGeom } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { grainImage } from "../../../scene/surface-grain.ts";
import { type MaterialPreset, paletteLook } from "../../../scene/visual-styles/palette-look.ts";
import { plainLook, styledLook } from "../../../scene/visual-styles/part-look.ts";
import { isMaterialPreset, isPaletteList, swatchGrain } from "./material-swatches.ts";

const PRESETS: MaterialPreset[] = [
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
];

const part = (material: MaterialPreset | null): Pick<SceneGeom, "shape" | "material" | "finish" | "surface"> => ({
  shape: "box",
  material,
  finish: "brick",
  surface: "rubber",
});

describe("the material palette", () => {
  it("draws every material with a pattern that renders, without NaN texels", () => {
    for (const preset of PRESETS) {
      const grain = paletteLook(preset).grain;
      if (grain) {
        const image = grainImage(grain);
        expect(image.pixels.every((value) => Number.isFinite(value))).toBe(true);
        expect(new Set(image.pixels).size, preset).toBeGreaterThan(2);
      }
    }
  });

  it("makes glass see-through, neon glow, metals metallic and ice glossy", () => {
    expect(paletteLook("glass").opacity).toBeLessThan(0.5);
    expect(paletteLook("neon").emissive).toBeGreaterThan(1);
    expect(paletteLook("diamond_plate").metalness).toBeGreaterThan(0.5);
    expect(paletteLook("ice").roughness).toBeLessThan(0.2);
  });

  it("wins over the part's finish and surface, which still draw parts without a palette material", () => {
    expect(plainLook(part("wood")).grain).toBe("wood_grain");
    expect(plainLook(part(null)).grain).toBe("brick");
    expect(styledLook("paint", part("marble")).grain).toBe("marble");
  });

  it("recognises the engine's material list as a palette, and no other list", () => {
    const options = ["custom", ...PRESETS].map((value) => ({ value, label: value }));
    expect(isPaletteList(options)).toBe(true);
    expect(
      isPaletteList([
        { value: "custom", label: "Custom" },
        { value: "car_body", label: "Car body" },
      ]),
    ).toBe(false);
    expect(isMaterialPreset("custom")).toBe(false);
    expect(swatchGrain("custom")).toBeNull();
    expect(swatchGrain("brick")).toBe("brick");
  });
});
