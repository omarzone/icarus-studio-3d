import type { SceneGeom } from "@icarus/contracts";
import { type BufferGeometry, CapsuleGeometry, CylinderGeometry, SphereGeometry, TorusGeometry } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Finish } from "./finishes.ts";
import { type Extents, mergeByFinish, type StylePart } from "./style-parts.ts";

// The part's own shape with soft edges, the base of both robot looks.
function rounded(shape: SceneGeom["shape"], { x, y, z }: Extents): BufferGeometry | null {
  switch (shape) {
    case "box":
      return new RoundedBoxGeometry(x, y, z, 4, Math.min(x, y, z) * 0.22);
    case "sphere":
      return new SphereGeometry(x / 2, 40, 20);
    case "capsule":
      return new CapsuleGeometry(x / 2, Math.max(y - x, 0.001), 10, 24);
    case "cylinder":
      return new CylinderGeometry(x / 2, x / 2, y, 32);
    case "plane":
      return null;
  }
}

// A robot or character body panel (tokens: scene.material.shell).
export function shell(shape: SceneGeom["shape"], extents: Extents): StylePart[] | null {
  const body = rounded(shape, extents);
  return body ? mergeByFinish([["shell", body]]) : null;
}

// A limb in metal (tokens: scene.material.joint), with dark collars where a capsule or cylinder meets its neighbours.
export function joint(shape: SceneGeom["shape"], extents: Extents): StylePart[] | null {
  const body = rounded(shape, extents);
  if (!body) {
    return null;
  }
  const pieces: Array<readonly [Finish, BufferGeometry]> = [["joint", body]];
  if (shape === "capsule" || shape === "cylinder") {
    const radius = extents.x / 2;
    const reach = shape === "capsule" ? Math.max(extents.y / 2 - radius, 0) : extents.y / 2 - radius * 0.12;
    for (const end of [-1, 1]) {
      const collar = new TorusGeometry(radius * 0.9, radius * 0.1, 8, 24);
      collar.rotateX(Math.PI / 2);
      collar.translate(0, end * reach, 0);
      pieces.push(["trim", collar]);
    }
  }
  return mergeByFinish(pieces);
}
