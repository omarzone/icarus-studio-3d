import { type BufferGeometry, IcosahedronGeometry } from "three";
import { at, type Extents, mergeByFinish, type Piece, type StylePart } from "./style-parts.ts";

// Clumps of leaves as [x, y, z, size], each a share of the half extents with |offset| + size <= 1 on every axis, so
// every clump stays inside the box.
const CLUMPS = [
  [0, -0.1, 0, 0.85],
  [-0.45, -0.35, -0.3, 0.55],
  [0.42, -0.3, 0.35, 0.55],
  [0.35, 0.05, -0.4, 0.5],
  [-0.35, 0.1, 0.38, 0.5],
  [0.05, 0.4, 0.05, 0.6],
] as const;

function blob(rx: number, ry: number, rz: number): BufferGeometry {
  return new IcosahedronGeometry(1, 1).scale(rx, ry, rz);
}

// A bush: overlapping clumps of leaves in the part's color.
export function bush({ x, y, z }: Extents): StylePart[] {
  const pieces: Piece[] = CLUMPS.map(([fx, fy, fz, size]) => [
    "foliage",
    at(blob((size * x) / 2, (size * y) / 2, (size * z) / 2), (fx * x) / 2, (fy * y) / 2, (fz * z) / 2),
  ]);
  return mergeByFinish(pieces);
}

// Repeatable value in [0, 1) for a vertex position, so the copies of a shared vertex move together.
function jitter(x: number, y: number, z: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

// A boulder: a faceted lump pulled in at random points, flat underneath where it rests on the ground.
export function rock({ x, y, z }: Extents): StylePart[] {
  const geometry = new IcosahedronGeometry(1, 1);
  const position = geometry.getAttribute("position");
  const floor = -0.7;
  for (let index = 0; index < position.count; index += 1) {
    const px = position.getX(index);
    const py = position.getY(index);
    const pz = position.getZ(index);
    const pull = 0.78 + 0.22 * jitter(Math.round(px * 1e4), Math.round(py * 1e4), Math.round(pz * 1e4));
    // Squash the lump onto its flat base, then spread it back over the full height [-1, 1].
    const flat = Math.max(py * pull, floor);
    position.setXYZ(index, px * pull, ((flat - floor) / (1 - floor)) * 2 - 1, pz * pull);
  }
  geometry.computeVertexNormals();
  return mergeByFinish([["stone", geometry.scale(x / 2, y / 2, z / 2)]]);
}
