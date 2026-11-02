import { describe, expect, it } from "vitest";
import { grainImage } from "./surface-grain.ts";
import type { Grain } from "./visual-styles/finishes.ts";

const GRAINS: Grain[] = ["asphalt", "concrete", "grass", "snow", "ice", "rubber", "wood", "metal"];

describe("surface grain", () => {
  it("is the same image every time, so thumbnails and the viewport agree", () => {
    expect(grainImage("asphalt").pixels).toEqual(grainImage("asphalt").pixels);
  });

  it("only shades the surface's own color: opaque grey texels that never brighten it past itself", () => {
    for (const grain of GRAINS) {
      const { pixels, size } = grainImage(grain);
      expect(pixels.length).toBe(size * size * 4);
      for (let index = 0; index < pixels.length; index += 4) {
        expect(pixels[index]).toBe(pixels[index + 1]);
        expect(pixels[index + 3]).toBe(255);
      }
    }
  });

  it("gives each surface its own grain", () => {
    const signatures = GRAINS.map((grain) => grainImage(grain).pixels.slice(0, 256).join(","));
    expect(new Set(signatures).size).toBe(GRAINS.length);
  });
});
