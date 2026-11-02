import type { SceneDescription, SceneGeom } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { copyGrid, isFirstCopy, scenesGrid } from "./copy-grid.ts";
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

  it("marks exactly one copy's geoms as the one the camera follows", () => {
    const followed = copyGrid(scene, 4).description.geoms.filter(isFirstCopy);
    expect(followed.map((item) => item.body)).toEqual(["car", "wall"]);
  });
});

describe("scenesGrid", () => {
  const moved = (dx: number): SceneDescription => ({
    ...scene,
    geoms: scene.geoms.map((item) =>
      item.name === "wall" ? { ...item, position: [3 + dx, 0, 0.5], color: "#ff0000" } : item,
    ),
    zones: [
      {
        kind: "goal_zone",
        name: "goal",
        object: "goal",
        shape: "sphere",
        size: [1, 1, 1],
        position: [1, 0, 0],
        quaternion: [1, 0, 0, 0],
      },
    ],
  });

  it("draws each copy's own scene in its place, so the copies show how they differ", () => {
    const grid = scenesGrid([moved(0), moved(1)]);
    const walls = grid.description.geoms.filter((item) => item.body === "wall").map((item) => item.position[0]);
    // Footprint of the widest copy: x from -1 to 5, plus a 2 m margin, so the copies sit 8 m apart.
    expect(walls).toEqual([-4 + 3, 4 + 4]);
    expect(grid.description.geoms.every((item) => item.color === "#888888" || item.color === "#ff0000")).toBe(true);
    expect(grid.extent).toBe(16);
  });

  it("moves each copy's task zones with it", () => {
    const grid = scenesGrid([moved(0), moved(0), moved(0), moved(0)]);
    expect(grid.description.zones?.map((zone) => [zone.name, zone.position[0], zone.position[1]])).toEqual([
      ["0:goal", -2.5, -2],
      ["1:goal", 4.5, -2],
      ["2:goal", -2.5, 2],
      ["3:goal", 4.5, 2],
    ]);
  });

  it("draws a single copy as its scene, floor included", () => {
    const grid = scenesGrid([moved(0)]);
    expect(grid.description.geoms.map((item) => item.name)).toEqual(["0:floor", "0:car", "0:wall"]);
    expect(grid.description.geoms.filter(isFirstCopy)).toHaveLength(3);
  });

  it("is empty without copies", () => {
    expect(scenesGrid([]).description.geoms).toEqual([]);
  });
});
