import type { SceneGeom } from "@icarus/contracts";

// How far an endless ground plane is drawn: the physics plane never ends, so its drawing reaches the horizon instead
// of stopping at the plane's nominal size, where a body would seem to drive on nothing.
export const PLANE_DRAW_EXTENT = 1000;

type GroundLike = Pick<SceneGeom, "shape"> & { ground?: boolean };

// The world's floor: an endless plane, or a ground slab with edges. Floors are framed, picked and lit as the ground.
export function isGround(geom: GroundLike): boolean {
  return geom.shape === "plane" || geom.ground === true;
}

// Full extents the geom is drawn at: its own, except an endless plane, which reaches the horizon.
export function drawnSize(geom: Pick<SceneGeom, "shape" | "size">): [number, number, number] {
  const [x, y, z] = geom.size;
  return geom.shape === "plane" ? [Math.max(x, PLANE_DRAW_EXTENT), Math.max(y, PLANE_DRAW_EXTENT), z] : [x, y, z];
}
