import { BoxGeometry, CylinderGeometry } from "three";
import { at, type Extents, mergeByFinish, type Piece, type StylePart } from "./style-parts.ts";

// Most repeated pieces (pavers, treads, planks) one axis of a style may draw, so a huge part stays cheap.
const MOST = 30;

const count = (length: number, each: number) => Math.min(MOST, Math.max(1, Math.round(length / each)));

// A paved slab: a darker base under a grid of square pavers about 0.6 m across.
export function slab({ x, y, z }: Extents): StylePart[] {
  const top = Math.min(y * 0.3, 0.05);
  const across = count(x, 0.6);
  const deep = count(z, 0.6);
  const gap = Math.min(x / across, z / deep) * 0.04;
  const pieces: Piece[] = [["shade", at(new BoxGeometry(x * 0.995, y - top, z * 0.995), 0, -top / 2, 0)]];
  for (let i = 0; i < across; i += 1) {
    for (let k = 0; k < deep; k += 1) {
      const paver = new BoxGeometry(x / across - gap, top, z / deep - gap);
      pieces.push([
        "concrete",
        at(paver, -x / 2 + ((i + 0.5) * x) / across, y / 2 - top / 2, -z / 2 + ((k + 0.5) * z) / deep),
      ]);
    }
  }
  return mergeByFinish(pieces);
}

// One stair step: a block with a darker nosing along its front edge (−x), where a climber steps up.
export function step({ x, y, z }: Extents): StylePart[] {
  const nose = Math.min(x * 0.15, 0.05);
  const lip = y * 0.18;
  return mergeByFinish([
    ["concrete", at(new BoxGeometry(x - nose, y, z), nose / 2, 0, 0)],
    ["concrete", at(new BoxGeometry(nose, y - lip, z), -x / 2 + nose / 2, -lip / 2, 0)],
    ["shade", at(new BoxGeometry(nose, lip, z), -x / 2 + nose / 2, y / 2 - lip / 2, 0)],
  ]);
}

// A flight of stairs along its slab (x): a stringer under a row of treads, one about every 0.3 m.
export function stairs({ x, y, z }: Extents): StylePart[] {
  const treads = count(x, 0.3);
  const rise = y * 0.45;
  const pieces: Piece[] = [["shade", at(new BoxGeometry(x, y - rise, z), 0, -rise / 2, 0)]];
  for (let index = 0; index < treads; index += 1) {
    const tread = new BoxGeometry((x / treads) * 0.82, rise, z * 0.96);
    pieces.push(["concrete", at(tread, -x / 2 + ((index + 0.5) * x) / treads, y / 2 - rise / 2, 0)]);
  }
  return mergeByFinish(pieces);
}

// A column on a square plinth under a capital; round in a cylinder, square in a box.
export function pillar({ x, y, z }: Extents, round: boolean): StylePart[] {
  const plinth = Math.min(y * 0.06, 0.3);
  const capital = Math.min(y * 0.05, 0.25);
  const shaft = y - plinth - capital;
  const radius = Math.min(x, z) / 2;
  const column = round
    ? new CylinderGeometry(radius * 0.78, radius * 0.84, shaft, 20)
    : new BoxGeometry(x * 0.8, shaft, z * 0.8);
  const block = (height: number, scale: number) =>
    round
      ? new CylinderGeometry(radius * scale, radius * scale, height, 20)
      : new BoxGeometry(x * scale, height, z * scale);
  return mergeByFinish([
    ["shade", at(block(plinth, 1), 0, -y / 2 + plinth / 2, 0)],
    ["concrete", at(column, 0, -y / 2 + plinth + shaft / 2, 0)],
    ["shade", at(block(capital, 0.95), 0, y / 2 - capital / 2, 0)],
  ]);
}

// Wooden planks along the part's length (x) with gaps between them, on cross battens underneath.
export function planks({ x, y, z }: Extents): StylePart[] {
  const boards = count(z, 0.2);
  const deck = y * 0.65;
  const pieces: Piece[] = [];
  for (let index = 0; index < boards; index += 1) {
    const board = new BoxGeometry(x, deck, (z / boards) * 0.9);
    pieces.push(["wood", at(board, 0, y / 2 - deck / 2, -z / 2 + ((index + 0.5) * z) / boards)]);
  }
  const battens = Math.max(2, count(x, 1));
  for (let index = 0; index < battens; index += 1) {
    const batten = new BoxGeometry(Math.min(0.08, x / battens / 2), y - deck, z);
    pieces.push(["shade", at(batten, -x / 2 + ((index + 0.5) * x) / battens, -y / 2 + (y - deck) / 2, 0)]);
  }
  return mergeByFinish(pieces);
}
