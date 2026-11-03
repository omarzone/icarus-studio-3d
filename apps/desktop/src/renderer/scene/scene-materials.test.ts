import { describe, expect, it } from "vitest";
import { floorDepth } from "./scene-materials.ts";

describe("floor depth", () => {
  it("pushes the ground, a plane or a slab, back in depth so the grid drawn just above it never flickers through", () => {
    const pushed = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
    expect(floorDepth({ shape: "plane" })).toEqual(pushed);
    expect(floorDepth({ shape: "box", ground: true })).toEqual(pushed);
  });

  it("leaves solid geoms at their true depth", () => {
    for (const shape of ["box", "sphere", "capsule", "cylinder"] as const) {
      expect(floorDepth({ shape })).toEqual({});
    }
  });
});
