import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three";
import { toThreePosition } from "./coordinates.ts";

export type WedgeShape = "wedge" | "corner_wedge";
type Corner = readonly [number, number, number];

// Corners of the engine's wedge meshes in MuJoCo axes (design/wedges.py): a wedge's top edge runs along -y, a corner
// wedge's peak stands over the +x, -y corner. Both fill the box of the part's full size, centered on it.
export function wedgeCorners(shape: WedgeShape, [sx, sy, sz]: readonly [number, number, number]): Corner[] {
  const [x, y, z] = [sx / 2, sy / 2, sz / 2];
  const floor: Corner[] = [
    [-x, -y, -z],
    [x, -y, -z],
    [x, y, -z],
    [-x, y, -z],
  ];
  return shape === "wedge" ? [...floor, [-x, -y, z], [x, -y, z]] : [...floor, [x, -y, z]];
}

// Faces as corner indices, each wound counter-clockwise seen from outside.
const FACES: Readonly<Record<WedgeShape, readonly (readonly number[])[]>> = {
  wedge: [
    [0, 3, 2, 1],
    [0, 1, 5, 4],
    [3, 4, 5, 2],
    [0, 4, 3],
    [1, 2, 5],
  ],
  corner_wedge: [
    [0, 3, 2, 1],
    [0, 1, 4],
    [1, 2, 4],
    [2, 3, 4],
    [3, 0, 4],
  ],
};

// Flat-shaded Three geometry of a wedge, with texture coordinates in metres across each face so patterns keep their
// real size on the slope as on the sides.
export function wedgeGeometry(shape: WedgeShape, size: readonly [number, number, number]): BufferGeometry {
  const corners = wedgeCorners(shape, size).map((corner) => new Vector3(...toThreePosition(corner)));
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (const face of FACES[shape]) {
    const points = face.map((index) => corners[index] ?? new Vector3());
    const [a, b, c] = points as [Vector3, Vector3, Vector3];
    const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize();
    const across = new Vector3().subVectors(b, a).normalize();
    const up = new Vector3().crossVectors(normal, across);
    for (let index = 1; index + 1 < points.length; index += 1) {
      for (const point of [a, points[index], points[index + 1]]) {
        if (!point) {
          continue;
        }
        positions.push(point.x, point.y, point.z);
        normals.push(normal.x, normal.y, normal.z);
        const offset = new Vector3().subVectors(point, a);
        uvs.push(offset.dot(across), offset.dot(up));
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
