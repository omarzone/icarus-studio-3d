import type { SceneDescription, SceneGeom } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { copyGrid } from "./copy-grid.ts";
import type { Pose } from "./pose-track.ts";

const geom = (
  name: string,
  shape: SceneGeom["shape"],
  position: [number, number, number],
  size: number,
): SceneGeom => ({
  name,
  body: name,
  shape,
  color: "#888888",
  size: [size, size, size],
  position,
  quaternion: [1, 0, 0, 0],
});

const scene: SceneDescription = {
  revision: 1,
  bodies: [],
  lights: [],
  geoms: [
    geom("floor", "plane", [0, 0, 0], 40),
    geom("car", "box", [0, 0, 0.2], 2),
    geom("wall", "box", [3, 0, 0.5], 2),
  ],
};

const pose = (x: number): Pose => ({ position: [x, 0, 0.2], quaternion: [1, 0, 0, 0] });

describe("copyGrid", () => {
  it("draws one copy as the scene itself, with its poses", () => {
    const grid = copyGrid(scene, 1);
    expect(grid.description.geoms.map((item) => item.name)).toEqual(["0:floor", "0:car", "0:wall"]);
    expect(grid.place([new Map([["car", pose(1)]])]).get("0:car")).toEqual(pose(1));
  });

  it("lays copies out in a square grid around the scene, spaced by its footprint", () => {
    const copies = [0, 1, 2, 3].map(() => new Map([["car", pose(0)]]));
    const grid = copyGrid(scene, copies.length);
    // Footprint without the floor: x from -1 to 4 and y from -1 to 1, plus a 2 m margin.
    const cars = grid.description.geoms.filter((item) => item.name.endsWith(":car")).map((item) => item.position);
    expect(cars).toEqual([
      [-3.5, -2, 0.2],
      [3.5, -2, 0.2],
      [-3.5, 2, 0.2],
      [3.5, 2, 0.2],
    ]);
    expect(grid.place(copies).get("3:car")?.position).toEqual([3.5, 2, 0.2]);
    expect(grid.extent).toBe(14);
  });

  it("leaves the floors out when there are several copies, so they do not overlap", () => {
    const grid = copyGrid(scene, 2);
    expect(grid.description.geoms.some((item) => item.shape === "plane")).toBe(false);
    expect(grid.description.geoms).toHaveLength(4);
  });
});
