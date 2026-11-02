import { describe, expect, it } from "vitest";
import { floorDepth } from "./scene-materials.ts";

describe("floor depth", () => {
  it("pushes a ground plane back in depth so the grid drawn just above it never flickers through", () => {
    expect(floorDepth("plane")).toEqual({ polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  });

  it("leaves solid geoms at their true depth", () => {
    for (const shape of ["box", "sphere", "capsule", "cylinder"] as const) {
      expect(floorDepth(shape)).toEqual({});
    }
  });
});
