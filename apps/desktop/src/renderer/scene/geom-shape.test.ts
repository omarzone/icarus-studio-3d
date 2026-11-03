import type { SceneGeom } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { bevelRadius, geomShape } from "./geom-shape.ts";
import { PLANE_DRAW_EXTENT } from "./ground-geom.ts";

const geom = (shape: SceneGeom["shape"], size: [number, number, number]): SceneGeom => ({
  name: "g",
  body: "b",
  color: "#808080",
  shape,
  size,
  position: [0, 0, 0],
  quaternion: [1, 0, 0, 0],
});

describe("MuJoCo geom to Three geometry", () => {
  it("stands a box's MuJoCo height (z) on Three's up axis (y)", () => {
    expect(geomShape(geom("box", [1, 2, 3]))).toEqual({ kind: "box", args: [1, 3, 2] });
  });

  it("gives a capsule its straight length between the two caps", () => {
    expect(geomShape(geom("capsule", [0.2, 0.2, 1]))).toEqual({ kind: "capsule", args: [0.1, 0.8, 8, 16] });
  });

  it("draws an endless ground plane as a thin slab out to the horizon, never ending where a body still stands", () => {
    expect(geomShape(geom("plane", [40, 20, 0.1]))).toEqual({
      kind: "box",
      args: [PLANE_DRAW_EXTENT, 0.002, PLANE_DRAW_EXTENT],
    });
  });

  it("draws a ground slab at its own size, edges and thickness included", () => {
    expect(geomShape({ ...geom("box", [6, 4, 1]), ground: true })).toEqual({ kind: "box", args: [6, 1, 4] });
  });

  it("rounds only a box's edges, never past a third of its thinnest side", () => {
    expect(bevelRadius({ ...geom("box", [1, 1, 1]), bevel: 0.05 })).toBe(0.05);
    expect(bevelRadius({ ...geom("box", [1, 1, 0.06]), bevel: 0.05 })).toBeCloseTo(0.02);
    expect(bevelRadius({ ...geom("sphere", [1, 1, 1]), bevel: 0.05 })).toBe(0);
    expect(bevelRadius(geom("box", [1, 1, 1]))).toBe(0);
  });
});
