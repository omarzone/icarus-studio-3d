import type { SceneGeom, SceneSkin } from "@icarus/contracts";
import { toThreePosition, toThreeQuaternion, type Vector3 } from "./coordinates.ts";
import { multiply, type Quaternion, rotate } from "./quaternion.ts";

type Vec3 = [number, number, number];

// The box a loaded model occupies in its own frame (glTF is Y-up, like Three).
export type ModelBounds = { min: Vector3; max: Vector3 };

// Where the model's root goes inside the geom's Three object, so the whole model sits in the collider's box.
export type SkinPlacement = { scale: number; position: Vec3; quaternion: [number, number, number, number] };

const DEGREES = Math.PI / 180;

function axis(index: 1 | 2 | 3, degrees: number): Quaternion {
  const half = (degrees * DEGREES) / 2;
  const q: [number, number, number, number] = [Math.cos(half), 0, 0, 0];
  q[index] = Math.sin(half);
  return q;
}

// The skin's turn in MuJoCo axes, around the part's fixed X, then Y, then Z (as the engine turns objects).
function turn([x, y, z]: Vector3): Quaternion {
  return multiply(axis(3, z), multiply(axis(2, y), axis(1, x)));
}

// Full extents of the collider's box in the geom's Three frame (MuJoCo z is Three's y).
function colliderBox(geom: SceneGeom): Vec3 {
  const [x, y, z] = geom.size;
  return [x, z, y];
}

// Uniform scale that fits the turned model inside the collider's box times `fill`, with the offset clamped so the
// model never leaves it. Null when there is nothing to fit (a flat model or a plane).
export function skinPlacement(geom: SceneGeom, skin: SceneSkin, bounds: ModelBounds): SkinPlacement | null {
  const box = colliderBox(geom);
  if (geom.shape === "plane" || box.some((side) => side <= 0)) {
    return null;
  }
  const [qx, qy, qz, qw] = toThreeQuaternion(turn(skin.rotation ?? [0, 0, 0]));
  const threeTurn: Quaternion = [qw, qx, qy, qz];
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((index) =>
    rotate(threeTurn, [
      index & 1 ? bounds.max[0] : bounds.min[0],
      index & 2 ? bounds.max[1] : bounds.min[1],
      index & 4 ? bounds.max[2] : bounds.min[2],
    ]),
  );
  const low = [0, 1, 2].map((i) => Math.min(...corners.map((corner) => corner[i] ?? 0)));
  const high = [0, 1, 2].map((i) => Math.max(...corners.map((corner) => corner[i] ?? 0)));
  const size = [0, 1, 2].map((i) => (high[i] ?? 0) - (low[i] ?? 0));
  const ratios = size.flatMap((side, i) => (side > 1e-9 ? [(box[i] ?? 0) / side] : []));
  if (ratios.length === 0) {
    return null;
  }
  const fill = Math.min(1, Math.max(0.1, skin.fill ?? 1));
  const scale = fill * Math.min(...ratios);
  const offset = toThreePosition(skin.offset ?? [0, 0, 0]);
  const position = [0, 1, 2].map((i) => {
    const room = Math.max(0, ((box[i] ?? 0) - (size[i] ?? 0) * scale) / 2);
    const shift = Math.min(room, Math.max(-room, offset[i] ?? 0));
    const center = ((low[i] ?? 0) + (high[i] ?? 0)) / 2;
    return shift - center * scale;
  });
  return { scale, position: [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0], quaternion: [qx, qy, qz, qw] };
}
