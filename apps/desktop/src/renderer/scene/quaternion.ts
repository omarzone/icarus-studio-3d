import type { Vector3 } from "./coordinates.ts";

// Unit quaternions in MuJoCo's order (w, x, y, z).
export type Quaternion = readonly [number, number, number, number];

export function multiply([aw, ax, ay, az]: Quaternion, [bw, bx, by, bz]: Quaternion): Quaternion {
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

export function conjugate([w, x, y, z]: Quaternion): Quaternion {
  return [w, -x, -y, -z];
}

export function rotate(q: Quaternion, [x, y, z]: Vector3): [number, number, number] {
  const [, rx, ry, rz] = multiply(multiply(q, [0, x, y, z]), conjugate(q));
  return [rx, ry, rz];
}

// Spherical interpolation along the shorter arc.
export function slerp(from: Quaternion, to: Quaternion, t: number): Quaternion {
  let cos = from[0] * to[0] + from[1] * to[1] + from[2] * to[2] + from[3] * to[3];
  const sign = cos < 0 ? -1 : 1;
  cos *= sign;
  if (cos > 0.9995) {
    const mixed = from.map((value, index) => value + (sign * (to[index] ?? 0) - value) * t);
    const length = Math.hypot(...mixed);
    const [w = 1, x = 0, y = 0, z = 0] = mixed.map((value) => value / length);
    return [w, x, y, z];
  }
  const angle = Math.acos(cos);
  const a = Math.sin((1 - t) * angle) / Math.sin(angle);
  const b = (sign * Math.sin(t * angle)) / Math.sin(angle);
  return [a * from[0] + b * to[0], a * from[1] + b * to[1], a * from[2] + b * to[2], a * from[3] + b * to[3]];
}
