import type { SceneDescription, SceneGeom, SceneRay } from "@icarus/contracts";
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
  // The copies' distance sensors shifted to their places, sensors named "<copy>:<sensor>"; only one copy's when given.
  placeRays: (copies: readonly (readonly SceneRay[])[], only?: number) => SceneRay[];
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

// Geom names become "<copy>:<geom>"; the camera follows the agent of the first copy.
export const isFirstCopy = (geom: SceneGeom): boolean => geom.name.startsWith("0:");

// Each copy's offset in a square grid of cells this wide and deep; one copy stays where it is.
function gridOffsets(
  count: number,
  spacing: readonly [number, number],
): { offsets: [number, number][]; extent: number } {
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / columns));
  const offsets = Array.from({ length: count }, (_, index): [number, number] =>
    count > 1
      ? [
          ((index % columns) - (columns - 1) / 2) * spacing[0],
          (Math.floor(index / columns) - (rows - 1) / 2) * spacing[1],
        ]
      : [0, 0],
  );
  return { offsets, extent: Math.max(columns * spacing[0], rows * spacing[1]) };
}

const solid = (geoms: readonly SceneGeom[]) => geoms.filter((geom) => geom.shape !== "plane");

function placeGeoms(geoms: readonly SceneGeom[], index: number, offset: readonly number[]): SceneGeom[] {
  return geoms.map((geom) => ({ ...geom, name: `${index}:${geom.name}`, position: shifted(geom.position, offset) }));
}

// Floors are left out when there are several copies, the grid is the ground.
export function copyGrid(scene: SceneDescription, count: number): CopyGrid {
  const geoms = count > 1 ? solid(scene.geoms) : scene.geoms;
  const [width, depth] = footprint(solid(scene.geoms));
  const { offsets, extent } = gridOffsets(count, [width + MARGIN, depth + MARGIN]);
  const placed = offsets.flatMap((offset, index) => placeGeoms(geoms, index, offset));
  return {
    description: { ...scene, geoms: placed },
    extent,
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
    placeRays: (copies, only) =>
      copies.flatMap((rays, index) => {
        const offset = offsets[index];
        if (!offset || (only !== undefined && only !== index)) {
          return [];
        }
        return rays.map((ray) => ({ ...ray, sensor: `${index}:${ray.sensor}`, origin: shifted(ray.origin, offset) }));
      }),
  };
}

// Training copies that each start differently (their own scene), side by side with their task zones, spaced by
// the widest copy; the first copy's lights and sky light them all.
export function scenesGrid(scenes: readonly SceneDescription[]): Omit<CopyGrid, "place" | "placeRays"> {
  const sizes = scenes.map((scene) => footprint(solid(scene.geoms)));
  const width = Math.max(0, ...sizes.map(([x]) => x));
  const depth = Math.max(0, ...sizes.map(([, y]) => y));
  const { offsets, extent } = gridOffsets(scenes.length, [width + MARGIN, depth + MARGIN]);
  const several = scenes.length > 1;
  const geoms = scenes.flatMap((scene, index) =>
    placeGeoms(several ? solid(scene.geoms) : scene.geoms, index, offsets[index] ?? [0, 0]),
  );
  const zones = scenes.flatMap((scene, index) =>
    (scene.zones ?? []).map((zone) => ({
      ...zone,
      name: `${index}:${zone.name}`,
      position: shifted(zone.position, offsets[index] ?? [0, 0]),
    })),
  );
  const first = scenes[0];
  return {
    description: {
      revision: first?.revision ?? 0,
      bodies: first?.bodies ?? [],
      lights: first?.lights ?? [],
      sky: first?.sky ?? null,
      geoms,
      zones,
    },
    extent,
  };
}
