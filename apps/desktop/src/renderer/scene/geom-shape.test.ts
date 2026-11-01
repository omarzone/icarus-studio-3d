import type { SceneGeom } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { geomShape } from "./geom-shape.ts";

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

  it("draws a plane as a thin slab lying flat", () => {
    expect(geomShape(geom("plane", [40, 20, 0.1]))).toEqual({ kind: "box", args: [40, 0.002, 20] });
  });
});
