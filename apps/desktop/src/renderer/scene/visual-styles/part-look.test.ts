import { describe, expect, it } from "vitest";
import { finishLook, surfaceLook } from "./finishes.ts";
import { adjusted, plainLook, styledLook } from "./part-look.ts";

const BOX = { shape: "box" } as const;

describe("part looks", () => {
  it("keeps every look scenes had before finishes when the part sets none", () => {
    expect(plainLook({ ...BOX, surface: "wood" })).toEqual(surfaceLook("wood", "box"));
    expect(styledLook("paint", BOX)).toEqual(finishLook("paint"));
    expect(styledLook("window", BOX).emissive).toBeUndefined();
  });

  it("moves roughness and metalness from the finish's own toward 0 or 1, keeping them at 0.5", () => {
    expect(adjusted(0.4, 0.5)).toBeCloseTo(0.4);
    expect(adjusted(0.4, 0)).toBe(0);
    expect(adjusted(0.4, 1)).toBe(1);
    expect(adjusted(0.4, 0.25)).toBeCloseTo(0.2);
    expect(adjusted(0.4, 7)).toBe(1);
  });

  it("lays the part's finish on pieces in its own color but never on its glass or lights", () => {
    expect(plainLook({ ...BOX, finish: "brick" }).grain).toBe("brick");
    expect(styledLook("matte", { ...BOX, finish: "brick" }).grain).toBe("brick");
    expect(styledLook("window", { ...BOX, finish: "brick" }).grain).toBeUndefined();
    expect(plainLook({ ...BOX, finish: "glass" }).opacity).toBeLessThan(1);
    expect(plainLook({ ...BOX, finish: "asphalt" }).grain).toBe("road");
  });

  it("lights windows and lamps with the part's glow, and a whole plain part without a style", () => {
    expect(styledLook("window", { ...BOX, emissive: 0.6 }).emissive).toBeCloseTo(0.6);
    expect(styledLook("lamp", { ...BOX, emissive: 1 }).emissive).toBeGreaterThan(finishLook("lamp").emissive ?? 0);
    expect(styledLook("paint", { ...BOX, emissive: 1 }).emissive).toBeUndefined();
    expect(plainLook({ ...BOX, emissive: 2 }).emissive).toBe(2);
  });
});
