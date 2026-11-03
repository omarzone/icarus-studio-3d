import { BoxGeometry, type BufferGeometry, ExtrudeGeometry, Shape } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Finish } from "./finishes.ts";
import { onWheels } from "./parked-car.ts";
import { at, type Extents, mergeByFinish, type Piece, type StylePart } from "./style-parts.ts";

// How a body is shaped, as shares of its box: the lower shell's height, and the cabin's length, its shift toward the
// front (+x) and how far its roof steps in from the cabin's front and rear at the bottom.
type Profile = { lower: number; cabin: number; shift: number; front: number; rear: number };

const HATCHBACK: Profile = { lower: 0.52, cabin: 0.66, shift: -0.12, front: 0.3, rear: 0.06 };
const SUV: Profile = { lower: 0.55, cabin: 0.74, shift: -0.1, front: 0.2, rear: 0.03 };
const CAB: Profile = { lower: 0.55, cabin: 0.34, shift: 0.17, front: 0.32, rear: 0.02 };

// The cabin's side outline (length along x, height along y) extruded across the body and fitted inside its box.
function cabin(length: number, height: number, width: number, front: number, rear: number): BufferGeometry {
  const outline = new Shape();
  outline.moveTo(-length / 2, 0);
  outline.lineTo(length / 2, 0);
  outline.lineTo(length / 2 - length * front, height);
  outline.lineTo(-length / 2 + length * rear, height);
  outline.closePath();
  const bevel = Math.min(height, width) * 0.06;
  const geometry = new ExtrudeGeometry(outline, {
    depth: width - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box) {
    geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    geometry.scale(length / (box.max.x - box.min.x), height / (box.max.y - box.min.y), 1);
  }
  return geometry;
}

// Lights, bumpers and a sill for a body `length` by `height` by `width` whose shell is `lower` tall.
function details(length: number, height: number, width: number, lower: number): Piece[] {
  const bottom = -height / 2;
  const lamp = (finish: Finish, side: number, z: number): Piece => [
    finish,
    at(
      new BoxGeometry(length * 0.015, lower * 0.2, width * 0.2),
      side * (length / 2 - length * 0.0075),
      bottom + lower * 0.72,
      z,
    ),
  ];
  const bumper = (side: number): Piece => [
    "trim",
    at(
      new BoxGeometry(length * 0.02, lower * 0.3, width * 0.96),
      side * (length / 2 - length * 0.01),
      bottom + lower * 0.25,
      0,
    ),
  ];
  return [
    bumper(1),
    bumper(-1),
    ["trim", at(new BoxGeometry(length * 0.7, lower * 0.1, width), 0, bottom + lower * 0.1, 0)],
    lamp("headlight", 1, width * 0.34),
    lamp("headlight", 1, -width * 0.34),
    lamp("taillight", -1, width * 0.36),
    lamp("taillight", -1, -width * 0.36),
  ];
}

// A closed body: a rounded shell, a glass cabin of the profile's shape and a painted roof over it.
function closedBody({ x: length, y: height, z: width }: Extents, profile: Profile): StylePart[] {
  const bottom = -height / 2;
  const lower = height * profile.lower;
  const upper = height - lower;
  const cabinLength = length * profile.cabin;
  const roof = cabinLength * (1 - profile.front - profile.rear);
  const roofX = length * profile.shift + (cabinLength * (profile.rear - profile.front)) / 2;
  const pieces: Piece[] = [
    [
      "paint",
      at(
        new RoundedBoxGeometry(length * 0.97, lower, width, 3, Math.min(lower, width) * 0.3),
        0,
        bottom + lower / 2,
        0,
      ),
    ],
    [
      "glass",
      at(
        cabin(cabinLength, upper * 0.88, width * 0.86, profile.front, profile.rear),
        length * profile.shift,
        bottom + lower,
        0,
      ),
    ],
    [
      "paint",
      at(
        new RoundedBoxGeometry(roof, upper * 0.12, width * 0.88, 2, upper * 0.05),
        roofX,
        bottom + lower + upper * 0.94,
        0,
      ),
    ],
    ...details(length, height, width, lower),
  ];
  return mergeByFinish(pieces);
}

// A pickup's body: a cab at the front and an open bed with low walls and a tailgate behind it.
function pickupBody(extents: Extents): StylePart[] {
  const { x: length, y: height, z: width } = extents;
  const bottom = -height / 2;
  const lower = height * CAB.lower;
  const upper = height - lower;
  const cabLength = length * CAB.cabin;
  const cabRear = length * CAB.shift - cabLength / 2;
  const bed = cabRear + length / 2;
  const wall = width * 0.06;
  const side = upper * 0.4;
  const roof = cabLength * (1 - CAB.front - CAB.rear);
  const roofX = length * CAB.shift + (cabLength * (CAB.rear - CAB.front)) / 2;
  const bedX = -length / 2 + bed / 2;
  const pieces: Piece[] = [
    [
      "paint",
      at(
        new RoundedBoxGeometry(length * 0.97, lower, width, 3, Math.min(lower, width) * 0.25),
        0,
        bottom + lower / 2,
        0,
      ),
    ],
    [
      "glass",
      at(cabin(cabLength, upper * 0.88, width * 0.86, CAB.front, CAB.rear), length * CAB.shift, bottom + lower, 0),
    ],
    [
      "paint",
      at(
        new RoundedBoxGeometry(roof, upper * 0.12, width * 0.88, 2, upper * 0.05),
        roofX,
        bottom + lower + upper * 0.94,
        0,
      ),
    ],
    ["trim", at(new BoxGeometry(bed * 0.92, lower * 0.04, width - 2 * wall), bedX, bottom + lower + lower * 0.02, 0)],
    ["paint", at(new BoxGeometry(bed * 0.97, side, wall), bedX, bottom + lower + side / 2, width / 2 - wall / 2)],
    ["paint", at(new BoxGeometry(bed * 0.97, side, wall), bedX, bottom + lower + side / 2, -width / 2 + wall / 2)],
    [
      "paint",
      at(new BoxGeometry(wall, side, width), -length / 2 + length * 0.015 + wall / 2, bottom + lower + side / 2, 0),
    ],
    ...details(length, height, width, lower),
  ];
  return mergeByFinish(pieces);
}

// A parked pickup truck, a small hatchback and a tall SUV, each on four wheels inside its box.
export function pickup(extents: Extents): StylePart[] {
  return onWheels(extents, pickupBody, 0.34);
}

export function hatchback(extents: Extents): StylePart[] {
  return onWheels(extents, (box) => closedBody(box, HATCHBACK), 0.31);
}

export function suv(extents: Extents): StylePart[] {
  return onWheels(extents, (box) => closedBody(box, SUV), 0.32);
}
