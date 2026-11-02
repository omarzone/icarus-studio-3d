import { describe, expect, it } from "vitest";
import { domeExtras, towardSun } from "./atmosphere.ts";
import { toThreePosition } from "./coordinates.ts";

const SKY = { top: "#5f8fc4", horizon: "#e4ecef", ambient: 1, fog: 0 };
const SUN = {
  name: "sun",
  position: [0, 0, 10] as [number, number, number],
  direction: [0, 0, -1] as [number, number, number],
  intensity: 1,
};

describe("dome extras", () => {
  it("draws nothing extra for a sky saved before these fields", () => {
    expect(domeExtras(SKY, SUN)).toMatchObject({
      sunRadius: 0,
      glare: 0,
      haze: 0,
      stars: 0,
      clouds: { cover: 0, density: 0.7, color: "#ffffff" },
    });
  });

  it("puts the sun where the first light shines from, in Three axes", () => {
    // A light shining straight down comes from straight up, which is Three's +y.
    expect(towardSun(SUN).map((value) => value + 0)).toEqual(toThreePosition([0, 0, 1]).map((value) => value + 0));
    const [x, y, z] = towardSun({ ...SUN, direction: [3, 0, -4] });
    expect(Math.hypot(x, y, z)).toBeCloseTo(1);
    expect(y).toBeGreaterThan(0);
  });

  it("turns the sun size in degrees into the disc's angular radius and keeps amounts in range", () => {
    const extras = domeExtras({ ...SKY, sun_size: 10, glare: 3, stars: -1, clouds: 0.5, cloud_color: "bad" }, SUN);
    expect(extras.sunRadius).toBeCloseTo((5 * Math.PI) / 180);
    expect(extras.glare).toBe(1);
    expect(extras.stars).toBe(0);
    expect(extras.clouds).toEqual({ cover: 0.5, density: 0.7, color: "#ffffff" });
    expect(domeExtras({ ...SKY, sun_size: 90 }, SUN).sunRadius).toBeCloseTo((15 * Math.PI) / 180);
  });

  it("tints the sun disc with the light's color", () => {
    expect(domeExtras(SKY, { ...SUN, color: "#ffb36b" }).sunColor).toBe("#ffb36b");
    expect(domeExtras(SKY, undefined).sunColor).toBe("#ffffff");
  });
});
