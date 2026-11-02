import type { SceneDescription, SceneGeom } from "@icarus/contracts";
import type { Pose, Poses } from "./pose-track.ts";

// The parallel copies of a training run side by side: each copy's geoms shifted by its place in a square grid.

// Space between neighbouring copies, in metres.
const MARGIN = 2;

export type CopyGrid = {
  // Every copy's geoms in their place; it only changes with the scene or the number of copies.
  description: SceneDescription;
  // Width of the whole grid in metres, so the camera can frame it.
  extent: number;
  // The copies' poses shifted to their places, by grid geom name.
  place: (copies: readonly Poses[]) => Poses;
};

type Vec3 = [number, number, number];

// Width and depth the geoms cover, in metres.
function footprint(geoms: readonly SceneGeom[]): [number, number] {
  if (geoms.length === 0) {
    return [0, 0];
  }
  const xs = geoms.flatMap((geom) => [geom.position[0] - geom.size[0] / 2, geom.position[0] + geom.size[0] / 2]);
  const ys = geoms.flatMap((geom) => [geom.position[1] - geom.size[1] / 2, geom.position[1] + geom.size[1] / 2]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return [maxX - minX, maxY - minY];
}

const shifted = ([x, y, z]: readonly number[], [dx, dy]: readonly number[]): Vec3 => [
  (x ?? 0) + (dx ?? 0),
  (y ?? 0) + (dy ?? 0),
  z ?? 0,
];

// Geom names become "<copy>:<geom>"; floors are left out when there are several copies, the grid is the ground.
export function copyGrid(scene: SceneDescription, count: number): CopyGrid {
  const several = count > 1;
  const geoms = several ? scene.geoms.filter((geom) => geom.shape !== "plane") : scene.geoms;
  const [width, depth] = footprint(scene.geoms.filter((geom) => geom.shape !== "plane"));
  const spacing = [width + MARGIN, depth + MARGIN] as const;
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / columns));
  const offsets = Array.from({ length: count }, (_, index): [number, number] =>
    several
      ? [
          ((index % columns) - (columns - 1) / 2) * spacing[0],
          (Math.floor(index / columns) - (rows - 1) / 2) * spacing[1],
        ]
      : [0, 0],
  );
  const placed = offsets.flatMap((offset, index) =>
    geoms.map((geom) => ({ ...geom, name: `${index}:${geom.name}`, position: shifted(geom.position, offset) })),
  );
  return {
    description: { ...scene, geoms: placed },
    extent: Math.max(columns * spacing[0], rows * spacing[1]),
    place: (copies) => {
      const poses = new Map<string, Pose>();
      copies.forEach((copy, index) => {
        const offset = offsets[index];
        if (!offset) {
          return;
        }
        for (const [name, pose] of copy) {
          poses.set(`${index}:${name}`, { position: shifted(pose.position, offset), quaternion: pose.quaternion });
        }
      });
      return poses;
    },
  };
}
