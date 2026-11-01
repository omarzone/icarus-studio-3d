import type { SceneGeom, SceneZone } from "@icarus/contracts";
import { toThreePosition, type Vector3 } from "./coordinates.ts";

// A sphere around what a scene shows, in MuJoCo world axes.
export type SceneBounds = { center: Vector3; radius: number };

// A camera in Three's axes; `fov` is vertical, in degrees.
export type ThumbnailCamera = {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  near: number;
  far: number;
};

const FOV = 35;
// Room around the subject so it never touches the edge of the picture.
const MARGIN = 1.15;
// The editor viewport's three-quarter direction, in MuJoCo axes (Three's [7, 6, 9]).
const DIRECTION: Vector3 = [7, -9, 6];
// Straight down in MuJoCo axes, tilted toward -y so screen "up" is the world's +y.
const TOP: Vector3 = [0, -0.001, 1];
const EMPTY: SceneBounds = { center: [0, 0, 0], radius: 4 };

// Half the extent of a geom's farthest point from its center; sizes are full extents (box) or diameter and length.
function reach({ shape, size: [x, y, z] }: SceneGeom): number {
  switch (shape) {
    case "box":
      return Math.hypot(x, y, z) / 2;
    case "sphere":
      return x / 2;
    case "cylinder":
    case "capsule":
      return Math.hypot(x, z) / 2;
    case "plane":
      return 0;
  }
}

type Sphere = { position: readonly [number, number, number]; reach: number };

// Ground planes are left out: they span the whole world and would shrink the subject to a dot.
// Task zones count, so a goal far from the agent is still in the picture.
export function sceneBounds(geoms: readonly SceneGeom[], zones: readonly SceneZone[] = []): SceneBounds | null {
  const spheres: Sphere[] = [
    ...geoms.filter((geom) => geom.shape !== "plane").map((geom) => ({ position: geom.position, reach: reach(geom) })),
    ...zones.map((zone) => ({
      position: zone.position,
      reach: zone.shape === "box" ? Math.hypot(...zone.size) / 2 : zone.size[0] / 2,
    })),
  ];
  if (spheres.length === 0) {
    return null;
  }
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (const { position, reach: r } of spheres) {
    for (const axis of [0, 1, 2] as const) {
      low[axis] = Math.min(low[axis] ?? Infinity, position[axis] - r);
      high[axis] = Math.max(high[axis] ?? -Infinity, position[axis] + r);
    }
  }
  const [lx = 0, ly = 0, lz = 0] = low;
  const [hx = 0, hy = 0, hz = 0] = high;
  return {
    center: [(lx + hx) / 2, (ly + hy) / 2, (lz + hz) / 2],
    radius: Math.max(Math.hypot(hx - lx, hy - ly, hz - lz) / 2, 0.05),
  };
}

// How far back a camera with this vertical field of view must be for the sphere to fit the narrower side.
function fitDistance(radius: number, aspect: number, fov: number): number {
  const vertical = (fov * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
  return (radius * MARGIN) / Math.sin(Math.min(vertical, horizontal) / 2);
}

function cameraAt(direction: Vector3, bounds: SceneBounds | null, aspect: number, fov: number): ThumbnailCamera {
  const { center, radius } = bounds ?? EMPTY;
  const away = fitDistance(radius, aspect, fov);
  const length = Math.hypot(...direction);
  const eye: Vector3 = [
    center[0] + (direction[0] / length) * away,
    center[1] + (direction[1] / length) * away,
    center[2] + (direction[2] / length) * away,
  ];
  return {
    position: toThreePosition(eye),
    target: toThreePosition(center),
    fov,
    near: Math.max((away - radius) / 10, 0.01),
    far: away + radius * 20,
  };
}

// A fixed three-quarter view far enough back that the bounding sphere fits the narrower side of the picture.
export function thumbnailCamera(bounds: SceneBounds | null, aspect: number, fov = FOV): ThumbnailCamera {
  return cameraAt(DIRECTION, bounds, aspect, fov);
}

// Straight down on the scene; a hair off vertical so orbiting from it has a defined "up".
export function topCamera(bounds: SceneBounds | null, aspect: number, fov = FOV): ThumbnailCamera {
  return cameraAt(TOP, bounds, aspect, fov);
}
