import { BoxGeometry, type BufferGeometry, ExtrudeGeometry, Shape } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Finish } from "./finishes.ts";
import { type Extents, mergeByFinish, type StylePart } from "./style-parts.ts";

const at = (geometry: BufferGeometry, x: number, y: number, z: number) => geometry.translate(x, y, z);

// The cabin's side outline (length along x, height along y), with a raked windshield at the front (+x).
function cabin(length: number, height: number, width: number): BufferGeometry {
  const outline = new Shape();
  outline.moveTo(-length / 2, 0);
  outline.lineTo(length / 2, 0);
  outline.lineTo(length * 0.12, height);
  outline.lineTo(-length * 0.36, height);
  outline.closePath();
  const bevel = Math.min(height, width) * 0.08;
  const geometry = new ExtrudeGeometry(outline, {
    depth: width - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  // Bevels grow the outline by `bevel` on every side; shrink it back inside the given box.
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box) {
    geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    geometry.scale(length / (box.max.x - box.min.x), height / (box.max.y - box.min.y), 1);
  }
  return geometry;
}

// A car drawn inside its chassis box: a rounded lower shell, a glass cabin under a painted roof, bumpers, a grille,
// headlights at the front (+x) and tail lights at the back. Everything stays inside the collider.
export function carBody({ x: length, y: height, z: width }: Extents): StylePart[] {
  const bottom = -height / 2;
  const lower = height * 0.55;
  const upper = height - lower;
  const shellLength = length * 0.97;
  const radius = Math.min(lower, width) * 0.3;
  const lamp = (finish: Finish, side: number, z: number): readonly [Finish, BufferGeometry] => [
    finish,
    at(
      new BoxGeometry(length * 0.015, lower * 0.22, width * 0.2),
      side * (length / 2 - length * 0.0075),
      bottom + lower * 0.7,
      z,
    ),
  ];
  const pieces: Array<readonly [Finish, BufferGeometry]> = [
    ["paint", at(new RoundedBoxGeometry(shellLength, lower, width, 3, radius), 0, bottom + lower / 2, 0)],
    ["glass", at(cabin(length * 0.56, upper * 0.86, width * 0.84), -length * 0.06, bottom + lower, 0)],
    [
      "paint",
      at(
        new RoundedBoxGeometry(length * 0.27, upper * 0.14, width * 0.86, 2, upper * 0.06),
        -length * 0.127,
        bottom + lower + upper * 0.93,
        0,
      ),
    ],
    [
      "trim",
      at(
        new BoxGeometry(length * 0.015, lower * 0.3, width * 0.94),
        length / 2 - length * 0.0075,
        bottom + lower * 0.28,
        0,
      ),
    ],
    [
      "trim",
      at(
        new BoxGeometry(length * 0.015, lower * 0.3, width * 0.94),
        -length / 2 + length * 0.0075,
        bottom + lower * 0.28,
        0,
      ),
    ],
    [
      "trim",
      at(
        new BoxGeometry(length * 0.012, lower * 0.24, width * 0.34),
        length / 2 - length * 0.006,
        bottom + lower * 0.66,
        0,
      ),
    ],
    ["trim", at(new BoxGeometry(shellLength * 0.6, lower * 0.1, width), -length * 0.02, bottom + lower * 0.12, 0)],
    lamp("headlight", 1, width * 0.33),
    lamp("headlight", 1, -width * 0.33),
    lamp("taillight", -1, width * 0.36),
    lamp("taillight", -1, -width * 0.36),
  ];
  return mergeByFinish(pieces);
}
