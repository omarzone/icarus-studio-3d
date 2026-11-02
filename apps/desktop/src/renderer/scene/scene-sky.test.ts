import { describe, expect, it } from "vitest";
import { FULL_FOG_DENSITY, skyLook } from "./scene-sky.ts";

const dusk = { top: "#1B2A3D", horizon: "#AEBCCB", ambient: 0.8, fog: 0.5 };

describe("sky look", () => {
  it("keeps the default look when the world has no sky", () => {
    expect(skyLook(null)).toBeNull();
    expect(skyLook(undefined)).toBeNull();
  });

  it("paints the sky with its two colors, lights the world with its ambient and hazes it in the horizon color", () => {
    expect(skyLook(dusk)).toEqual({
      top: "#1B2A3D",
      horizon: "#AEBCCB",
      ambient: 0.8,
      fog: { color: "#AEBCCB", density: 0.5 * FULL_FOG_DENSITY },
    });
  });

  it("has no fog at all when the haze is zero", () => {
    expect(skyLook({ ...dusk, fog: 0 })?.fog).toBeNull();
  });

  it("thins the haze for wider views, so a grid of copies is not lost in it", () => {
    expect(skyLook(dusk, 4)?.fog?.density).toBeCloseTo((0.5 * FULL_FOG_DENSITY) / 4);
    expect(skyLook(dusk, 0.5)?.fog?.density).toBeCloseTo(0.5 * FULL_FOG_DENSITY);
  });

  it("keeps ambient and haze inside their ranges", () => {
    const look = skyLook({ ...dusk, ambient: 5, fog: 3 });
    expect(look?.ambient).toBe(2);
    expect(look?.fog?.density).toBe(FULL_FOG_DENSITY);
    expect(skyLook({ ...dusk, ambient: -1, fog: -1 })).toMatchObject({ ambient: 0, fog: null });
  });

  it("falls back to the default look when a color is not one Three can read", () => {
    expect(skyLook({ ...dusk, top: "blue-ish" })).toBeNull();
  });
});
