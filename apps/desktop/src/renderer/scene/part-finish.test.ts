import { describe, expect, it } from "vitest";
import { partFinish } from "./part-finish.ts";

describe("part finish", () => {
  it("keeps the surface's look for parts without transparency or reflectance", () => {
    expect(partFinish({})).toEqual({ opacity: 1, envMapIntensity: 0, roughness: 1 });
  });

  it("makes parts see-through and mirror-like within range", () => {
    expect(partFinish({ transparency: 0.25, reflectance: 1 })).toEqual({
      opacity: 0.75,
      envMapIntensity: 1,
      roughness: expect.closeTo(0.15),
    });
    expect(partFinish({ transparency: 2, reflectance: -1 })).toMatchObject({ opacity: 0, envMapIntensity: 0 });
  });
});
