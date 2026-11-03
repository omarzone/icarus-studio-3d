// Transform values of an object from gizmo edits, in MuJoCo axes: positions in metres, quaternions wxyz,
// rotations in degrees applied around X, then Y, then Z (as the engine's Transform builds its quaternion).

export type Vec3 = [number, number, number];
export type Quat = readonly [w: number, x: number, y: number, z: number];

const IDENTITY: Quat = [1, 0, 0, 0];
const DEGREES = 180 / Math.PI;
const SCALE_MIN = 0.01;
const SCALE_MAX = 100;

export function multiply([aw, ax, ay, az]: Quat, [bw, bx, by, bz]: Quat): Quat {
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

function conjugate([w, x, y, z]: Quat): Quat {
  return [w, -x, -y, -z];
}

export function rotate(q: Quat, [x, y, z]: Vec3): Vec3 {
  const [, rx, ry, rz] = multiply(multiply(q, [0, x, y, z]), conjugate(q));
  return [rx, ry, rz];
}

// Rotates a world vector into a parent frame whose world rotation is the quaternion wxyz.
export function worldToParent(vector: Vec3, parent: Quat): Vec3 {
  return rotate(conjugate(parent), vector);
}

function axisAngle(axis: 0 | 1 | 2, degrees: number): Quat {
  const half = degrees / DEGREES / 2;
  const q: [number, number, number, number] = [Math.cos(half), 0, 0, 0];
  q[axis + 1] = Math.sin(half);
  return q;
}

export function eulerToQuat([x, y, z]: readonly [number, number, number]): Quat {
  return multiply(multiply(axisAngle(0, x), axisAngle(1, y)), axisAngle(2, z));
}

const round = (value: number, places: number) => {
  const factor = 10 ** places;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
};

// The X, Y, Z angles whose rotations, applied in that order, give the quaternion; rounded to a hundredth of a degree.
export function quatToEuler(q: Quat): Vec3 {
  const [w, x, y, z] = q;
  const r00 = 1 - 2 * (y * y + z * z);
  const r01 = 2 * (x * y - w * z);
  const r02 = 2 * (x * z + w * y);
  const r11 = 1 - 2 * (x * x + z * z);
  const r12 = 2 * (y * z - w * x);
  const r21 = 2 * (y * z + w * x);
  const r22 = 1 - 2 * (x * x + y * y);
  const ry = Math.asin(Math.min(1, Math.max(-1, r02)));
  // Looking straight along X: X and Z turn about the same axis, so Z takes none of it.
  const locked = Math.abs(r02) > 0.999999;
  const rx = locked ? Math.atan2(r21, r11) : Math.atan2(-r12, r22);
  const rz = locked ? 0 : Math.atan2(-r01, r00);
  return [round(rx * DEGREES, 2), round(ry * DEGREES, 2), round(rz * DEGREES, 2)];
}

// The object's own rotation after turning it by `delta` in world axes, under a parent at world rotation `parent`.
export function turnedRotation(
  rotation: readonly [number, number, number],
  delta: Quat,
  parent: Quat = IDENTITY,
): Vec3 {
  const local = eulerToQuat(rotation);
  const world = multiply(parent, local);
  return quatToEuler(multiply(conjugate(parent), multiply(delta, world)));
}

// The object's scale after stretching it by `factor` along its own axes, kept inside the Transform's range.
export function stretchedScale(
  scale: readonly [number, number, number],
  factor: readonly [number, number, number],
): Vec3 {
  const one = (index: 0 | 1 | 2) =>
    round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale[index] * Math.abs(factor[index]))), 3);
  return [one(0), one(1), one(2)];
}

export type Pose = { position: readonly [number, number, number]; quaternion: Quat };

// Position and rotation an object needs under a new parent (null: the world) to stay where it is in the world.
export function poseUnder(world: Pose, parent: Pose | null): { position: Vec3; rotation: Vec3 } {
  const origin: Pose = parent ?? { position: [0, 0, 0], quaternion: IDENTITY };
  const offset: Vec3 = [
    world.position[0] - origin.position[0],
    world.position[1] - origin.position[1],
    world.position[2] - origin.position[2],
  ];
  const [x, y, z] = worldToParent(offset, origin.quaternion);
  return {
    position: [round(x, 4), round(y, 4), round(z, 4)],
    rotation: quatToEuler(multiply(conjugate(origin.quaternion), world.quaternion)),
  };
}

// The value rounded to the nearest multiple of `step`; null or a non-positive step keeps it.
export function snapped(value: number, step: number | null): number {
  if (step === null || step <= 0) {
    return value;
  }
  return Math.round(value / step) * step;
}

// A scale factor rounded so the part's size along that axis lands on a multiple of `step`, never below one step.
export function snappedScale(scale: number, size: number, step: number | null): number {
  if (step === null || step <= 0 || size <= 0) {
    return scale;
  }
  const length = Math.max(step, snapped(scale * size, step));
  return length / size;
}
