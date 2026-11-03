import { BoxGeometry, ExtrudeGeometry, Shape } from "three";
import { at, type Extents, mergeByFinish, type Piece, type StylePart } from "./style-parts.ts";

// Most floors and window columns a facade draws, so a huge block stays cheap.
const MOST = 40;

const count = (length: number, each: number) => Math.min(MOST, Math.max(1, Math.round(length / each)));

// Panes on all four faces of a block whose walls are inset by `inset`: `rows` floors from `bottom` to `top`, one pane
// about every `spacing` metres along each face, each pane `fill` of its cell. Panes sit in the inset, inside the box.
function panes(
  { x, z }: Extents,
  inset: number,
  bottom: number,
  top: number,
  rows: number,
  spacing: number,
  fill: number,
): Piece[] {
  const pieces: Piece[] = [];
  const floor = (top - bottom) / rows;
  for (const [length, across, alongX] of [
    [x, z, true],
    [z, x, false],
  ] as const) {
    const columns = count(length, spacing);
    const cell = length / columns;
    for (let row = 0; row < rows; row += 1) {
      const height = bottom + (row + 0.5) * floor;
      for (let column = 0; column < columns; column += 1) {
        const offset = -length / 2 + (column + 0.5) * cell;
        for (const side of [-1, 1]) {
          const face = side * (across / 2 - inset / 2);
          const pane = alongX
            ? at(new BoxGeometry(cell * fill, floor * 0.55, inset), offset, height, face)
            : at(new BoxGeometry(inset, floor * 0.55, cell * fill), face, height, offset);
          pieces.push(["window", pane]);
        }
      }
    }
  }
  return pieces;
}

// A city block: walls in the part's color, rows of windows that light up with its glow, and a roof cap.
export function building(extents: Extents): StylePart[] {
  const { x, y, z } = extents;
  const inset = Math.min(x, z) * 0.015;
  const cap = Math.min(y * 0.04, 0.6);
  const floors = count(y - cap, 3.2);
  return mergeByFinish([
    ["concrete", at(new BoxGeometry(x - 2 * inset, y - cap, z - 2 * inset), 0, -cap / 2, 0)],
    ["shade", at(new BoxGeometry(x, cap, z), 0, y / 2 - cap / 2, 0)],
    ...panes(extents, inset, -y / 2, y / 2 - cap, floors, 2.4, 0.55),
  ]);
}

// A gable roof along x: a triangle across z extruded over the house's length.
function gable(length: number, width: number, height: number) {
  const outline = new Shape();
  outline.moveTo(-width / 2, 0);
  outline.lineTo(width / 2, 0);
  outline.lineTo(0, height);
  outline.closePath();
  return new ExtrudeGeometry(outline, { depth: length, bevelEnabled: false })
    .rotateY(Math.PI / 2)
    .translate(-length / 2, 0, 0);
}

// A small house: walls in the part's color, a pitched roof over its length, a door at the front (+x) and windows.
export function house(extents: Extents): StylePart[] {
  const { x, y, z } = extents;
  const inset = Math.min(x, z) * 0.04;
  const walls = y * 0.55;
  const bottom = -y / 2;
  const door = Math.min(2.1, walls * 0.75);
  const pane = Math.min(1.2, walls * 0.35);
  const sill = bottom + walls * 0.62;
  const pieces: Piece[] = [
    ["matte", at(new BoxGeometry(x - 2 * inset, walls, z - 2 * inset), 0, bottom + walls / 2, 0)],
    ["roof", at(gable(x, z, y - walls), 0, bottom + walls, 0)],
    ["trim", at(new BoxGeometry(inset, door, Math.min(1, z * 0.2)), x / 2 - inset / 2, bottom + door / 2, 0)],
    ["window", at(new BoxGeometry(inset, pane, Math.min(pane, z * 0.3)), -x / 2 + inset / 2, sill, 0)],
  ];
  const columns = count(x * 0.8, 2.2);
  for (let column = 0; column < columns; column += 1) {
    const offset = -x * 0.4 + ((column + 0.5) * x * 0.8) / columns;
    for (const side of [-1, 1]) {
      const opening = new BoxGeometry(Math.min(pane, (x * 0.8) / columns) * 0.8, pane, inset);
      pieces.push(["window", at(opening, offset, sill, side * (z / 2 - inset / 2))]);
    }
  }
  return mergeByFinish(pieces);
}

// A garage: walls in the part's color, a flat roof and a slatted roll-up door at the front (+x).
export function garage({ x, y, z }: Extents): StylePart[] {
  const inset = Math.min(x, z) * 0.03;
  const cap = Math.min(y * 0.06, 0.25);
  const doorHeight = (y - cap) * 0.78;
  const doorWidth = z * 0.72;
  const bottom = -y / 2;
  const pieces: Piece[] = [
    ["concrete", at(new BoxGeometry(x - inset, y - cap, z), -inset / 2, -cap / 2, 0)],
    ["shade", at(new BoxGeometry(x, cap, z), 0, y / 2 - cap / 2, 0)],
    ["metal", at(new BoxGeometry(inset * 0.6, doorHeight, doorWidth), x / 2 - inset * 0.7, bottom + doorHeight / 2, 0)],
  ];
  const slats = count(doorHeight, 0.25);
  for (let index = 1; index < slats; index += 1) {
    const slat = new BoxGeometry(inset * 0.4, 0.02, doorWidth);
    pieces.push(["trim", at(slat, x / 2 - inset * 0.2, bottom + (index * doorHeight) / slats, 0)]);
  }
  return mergeByFinish(pieces);
}
