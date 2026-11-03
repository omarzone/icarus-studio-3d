// The only conversion between MuJoCo (Z-up, quaternions wxyz) and Three.js (Y-up, quaternions xyzw).
// MuJoCo → Three is a rotation of −90° about x: (x, y, z) → (x, z, −y).

export type Vector3 = readonly [number, number, number];
export type ThreeQuaternion = readonly [x: number, y: number, z: number, w: number];

export function toThreePosition([x, y, z]: Vector3): [number, number, number] {
  return [x, z, -y];
}

export function fromThreePosition([x, y, z]: Vector3): [number, number, number] {
  return [x, -z, y];
}

// Conjugates the rotation by the frame change, so the same physical rotation is expressed in Y-up axes.
export function toThreeQuaternion([w, x, y, z]: readonly [number, number, number, number]): [
  number,
  number,
  number,
  number,
] {
  return [x, z, -y, w];
}

export function fromThreeQuaternion([x, y, z, w]: ThreeQuaternion): [number, number, number, number] {
  return [w, x, -z, y];
}
