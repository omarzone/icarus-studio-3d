import {
  BoxGeometry,
  type BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  SphereGeometry,
  TorusGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Finish } from "./finishes.ts";
import { type Extents, mergeByFinish, type StylePart } from "./style-parts.ts";

type Piece = readonly [Finish, BufferGeometry];

const at = (geometry: BufferGeometry, x: number, y: number, z: number) => geometry.translate(x, y, z);

// A wooden crate: inset panels inside a darker frame along its twelve edges.
export function crate({ x, y, z }: Extents): StylePart[] {
  const beam = Math.min(x, y, z) * 0.1;
  const pieces: Piece[] = [["matte", new BoxGeometry(x - beam, y - beam, z - beam)]];
  for (const [sx, sy] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ] as const) {
    pieces.push(["shade", at(new BoxGeometry(beam, beam, z), (sx * (x - beam)) / 2, (sy * (y - beam)) / 2, 0)]);
    pieces.push(["shade", at(new BoxGeometry(x, beam, beam), 0, (sx * (y - beam)) / 2, (sy * (z - beam)) / 2)]);
    pieces.push(["shade", at(new BoxGeometry(beam, y, beam), (sx * (x - beam)) / 2, 0, (sy * (z - beam)) / 2)]);
  }
  return mergeByFinish(pieces);
}

// A wall of panels with seams, a cap along the top and a plinth at the foot.
export function wall({ x, y, z }: Extents): StylePart[] {
  const along = x >= z ? "x" : "z";
  const length = Math.max(x, z);
  const thin = Math.min(x, z);
  const sized = (l: number, h: number, t: number) =>
    along === "x" ? new BoxGeometry(l, h, t) : new BoxGeometry(t, h, l);
  const shift = (offset: number) => (along === "x" ? [offset, 0] : [0, offset]);
  const cap = Math.min(y * 0.08, 0.08);
  const pieces: Piece[] = [
    [
      "concrete",
      new RoundedBoxGeometry(
        x * (along === "x" ? 1 : 0.88),
        y - 2 * cap,
        z * (along === "z" ? 1 : 0.88),
        2,
        thin * 0.1,
      ),
    ],
    ["shade", at(new RoundedBoxGeometry(x, cap, z, 2, cap * 0.4), 0, y / 2 - cap / 2, 0)],
    ["shade", at(new BoxGeometry(x, cap, z), 0, -y / 2 + cap / 2, 0)],
  ];
  const panels = Math.max(1, Math.round(length / 1.5));
  for (let index = 1; index < panels; index += 1) {
    const [dx = 0, dz = 0] = shift(-length / 2 + (index * length) / panels);
    pieces.push(["shade", at(sized(0.03, y - 2 * cap, thin), dx, 0, dz)]);
  }
  return mergeByFinish(pieces);
}

// A low concrete curb with rounded edges.
export function curb({ x, y, z }: Extents): StylePart[] {
  return mergeByFinish([["concrete", new RoundedBoxGeometry(x, y, z, 3, Math.min(x, y, z) * 0.25)]]);
}

// A bollard: a painted post with two reflective bands, a domed top and a dark foot ring.
export function post({ x, y }: Extents): StylePart[] {
  const radius = x / 2;
  const dome = Math.min(radius * 0.92, y / 2);
  const body = y - dome;
  const pieces: Piece[] = [
    ["paint", at(new CylinderGeometry(radius * 0.92, radius * 0.92, body, 28), 0, -y / 2 + body / 2, 0)],
    ["paint", at(new SphereGeometry(dome, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, y / 2 - dome, 0)],
    ["shade", at(new CylinderGeometry(radius, radius, y * 0.04, 28), 0, -y / 2 + y * 0.02, 0)],
  ];
  for (const height of [0.62, 0.74]) {
    pieces.push([
      "band",
      at(new CylinderGeometry(radius * 0.94, radius * 0.94, y * 0.05, 28), 0, -y / 2 + body * height, 0),
    ]);
  }
  return mergeByFinish(pieces);
}

// A traffic cone on a square foot, with white bands.
export function cone({ x, y, z }: Extents): StylePart[] {
  const foot = y * 0.06;
  const radius = Math.min(x, z) * 0.42;
  const height = y - foot;
  const pieces: Piece[] = [
    ["trim", at(new BoxGeometry(Math.min(x, z) * 0.98, foot, Math.min(x, z) * 0.98), 0, -y / 2 + foot / 2, 0)],
    ["paint", at(new ConeGeometry(radius, height, 28), 0, -y / 2 + foot + height / 2, 0)],
  ];
  for (const [low, high] of [
    [0.32, 0.42],
    [0.58, 0.66],
  ] as const) {
    const band = new CylinderGeometry(
      radius * (1 - high) * 1.04,
      radius * (1 - low) * 1.04,
      height * (high - low),
      28,
      1,
      true,
    );
    pieces.push(["band", at(band, 0, -y / 2 + foot + height * ((low + high) / 2), 0)]);
  }
  return mergeByFinish(pieces);
}

// A street lamp inside its column: a foot, a pole, a short arm and a glowing head.
export function lampPost({ x, y }: Extents): StylePart[] {
  const radius = x / 2;
  const pole = Math.min(radius * 0.35, 0.08);
  const head = Math.min(y * 0.06, radius);
  return mergeByFinish([
    ["metal", at(new CylinderGeometry(radius * 0.7, radius, y * 0.05, 20), 0, -y / 2 + y * 0.025, 0)],
    ["metal", new CylinderGeometry(pole * 0.8, pole, y, 16)],
    ["metal", at(new BoxGeometry(radius * 1.6, pole * 0.8, pole * 0.8), radius * 0.2, y / 2 - head * 1.6, 0)],
    [
      "metal",
      at(new CylinderGeometry(radius * 0.55, radius * 0.75, head * 0.6, 20), radius * 0.25, y / 2 - head * 0.3, 0),
    ],
    [
      "lamp",
      at(new CylinderGeometry(radius * 0.7, radius * 0.7, head * 0.2, 20), radius * 0.25, y / 2 - head * 0.7, 0),
    ],
  ]);
}

// A tree inside its column: a trunk under three stacked crowns of leaves in the part's color.
export function tree({ x, y, z }: Extents): StylePart[] {
  const radius = Math.min(x, z) / 2;
  const trunk = y * 0.4;
  const pieces: Piece[] = [
    ["bark", at(new CylinderGeometry(radius * 0.12, radius * 0.18, trunk, 10), 0, -y / 2 + trunk / 2, 0)],
  ];
  const crowns = [
    [0.95, 0.5],
    [0.75, 0.7],
    [0.5, 0.86],
  ] as const;
  for (const [size, height] of crowns) {
    const crown = Math.min(radius * size, y * (1 - height));
    pieces.push(["foliage", at(new IcosahedronGeometry(crown, 1), 0, -y / 2 + y * height, 0)]);
  }
  return mergeByFinish(pieces);
}

// A ball with three seams around it, so a rolling ball shows that it rolls.
export function ball({ x }: Extents): StylePart[] {
  const radius = x / 2;
  const seam = (turn: (geometry: TorusGeometry) => TorusGeometry): Piece => [
    "shade",
    turn(new TorusGeometry(radius * 0.985, radius * 0.015, 6, 48)),
  ];
  return mergeByFinish([
    ["paint", new SphereGeometry(radius * 0.995, 40, 20)],
    seam((geometry) => geometry),
    seam((geometry) => geometry.rotateX(Math.PI / 2)),
    seam((geometry) => geometry.rotateY(Math.PI / 2)),
  ]);
}

// Paint on the ground: the flat box itself, drawn as a decal.
export function marking({ x, y, z }: Extents): StylePart[] {
  return mergeByFinish([["marking", new BoxGeometry(x, Math.max(y, 0.002), z)]]);
}
