import type { SceneGeom } from "@icarus/contracts";
import { MeshStandardMaterial } from "three";
import { describe, expect, it } from "vitest";
import { groundMarks, markTexels } from "./ground-marks.ts";

const SIZE = 64;
const alphaAt = (pixels: Uint8Array, x: number, y: number) => pixels[(y * SIZE + x) * 4 + 3] ?? -1;

const slab: SceneGeom = {
  name: "ground",
  body: "ground",
  shape: "box",
  size: [20, 10, 1],
  position: [0, 0, -0.5],
  quaternion: [1, 0, 0, 0],
  color: "#3a3f47",
  ground: true,
  decal: "studs",
  decal_cell: 2,
};

describe("ground marks", () => {
  it("draws grid lines only at a cell's edges and a stud only in its middle", () => {
    const grid = markTexels("grid");
    expect(alphaAt(grid, 0, 32)).toBeGreaterThan(0);
    expect(alphaAt(grid, 32, 32)).toBe(0);
    const studs = markTexels("studs");
    expect(alphaAt(studs, 32, 32)).toBeGreaterThan(0);
    expect(alphaAt(studs, 2, 2)).toBe(0);
  });

  it("lays one mark per cell on the slab's top and none on other geoms", () => {
    const marks = groundMarks(slab);
    expect(marks?.position.y).toBeCloseTo(0.5, 2);
    const map = marks?.material instanceof MeshStandardMaterial ? marks.material.map : null;
    expect(map?.repeat.toArray()).toEqual([10, 5]);
    expect(groundMarks({ ...slab, decal: null })).toBeNull();
    expect(groundMarks({ ...slab, ground: false })).toBeNull();
  });
});
