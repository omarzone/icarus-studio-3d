import type { BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Finish } from "./finishes.ts";

// One drawn piece of a styled part, in the geom's own Three.js frame (MuJoCo local x, z, −y).
export type StylePart = { finish: Finish; geometry: BufferGeometry };

// A geom's full extents in its Three.js frame: x is MuJoCo x, y is MuJoCo z (up), z is MuJoCo y.
export type Extents = { x: number; y: number; z: number };

export type Piece = readonly [Finish, BufferGeometry];

export const at = (geometry: BufferGeometry, x: number, y: number, z: number) => geometry.translate(x, y, z);

// A long thin piece (fence, barrier, bench) built along x with length `length` and depth `depth`, turned to lie along
// z when the geom is longer along z, so it fits either way it is placed.
export function alongLongest(
  { x, y, z }: Extents,
  build: (length: number, height: number, depth: number) => Piece[],
): Piece[] {
  if (x >= z) {
    return build(x, y, z);
  }
  return build(z, y, x).map(([finish, geometry]) => [finish, geometry.rotateY(Math.PI / 2)] as const);
}

// Styled parts back into pieces, so a style can be drawn as part of another one (crates in a stack).
export function piecesOf(parts: readonly StylePart[], x: number, y: number, z: number): Piece[] {
  return parts.map((part) => [part.finish, part.geometry.clone().translate(x, y, z)] as const);
}

// Pieces sharing a finish become one geometry, so a styled part costs one draw call per finish.
export function mergeByFinish(pieces: ReadonlyArray<readonly [Finish, BufferGeometry]>): StylePart[] {
  const groups = new Map<Finish, BufferGeometry[]>();
  for (const [finish, geometry] of pieces) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    for (const name of Object.keys(flat.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "uv") {
        flat.deleteAttribute(name);
      }
    }
    groups.set(finish, [...(groups.get(finish) ?? []), flat]);
  }
  const parts: StylePart[] = [];
  for (const [finish, geometries] of groups) {
    const geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries);
    if (geometry) {
      parts.push({ finish, geometry });
    }
  }
  return parts;
}
