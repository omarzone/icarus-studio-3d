import { BoxGeometry } from "three";
import { alongLongest, at, type Extents, mergeByFinish, type Piece, type StylePart } from "./style-parts.ts";

// A table: a wooden top on four darker legs set in from the corners.
export function table({ x, y, z }: Extents): StylePart[] {
  const top = Math.min(y * 0.07, 0.05);
  const leg = Math.min(x, z) * 0.07;
  const pieces: Piece[] = [["wood", at(new BoxGeometry(x, top, z), 0, y / 2 - top / 2, 0)]];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new BoxGeometry(leg, y - top, leg);
      pieces.push(["shade", at(post, sx * (x / 2 - leg), -top / 2, sz * (z / 2 - leg))]);
    }
  }
  return mergeByFinish(pieces);
}

// A park bench: wooden seat and back slats on metal frames at both ends and in the middle; the back is at −depth.
export function bench(extents: Extents): StylePart[] {
  return mergeByFinish(
    alongLongest(extents, (length, height, depth) => {
      const seat = height * 0.5;
      const slat = height * 0.05;
      const bottom = -height / 2;
      const pieces: Piece[] = [];
      for (const share of [0.15, 0.4, 0.65]) {
        const board = new BoxGeometry(length, slat, depth * 0.2);
        pieces.push(["wood", at(board, 0, bottom + seat - slat / 2, depth / 2 - depth * share)]);
      }
      for (const level of [0.72, 0.9]) {
        const board = new BoxGeometry(length, height * 0.09, depth * 0.08);
        pieces.push(["wood", at(board, 0, bottom + height * level, -depth / 2 + depth * 0.04)]);
      }
      const frames = length > 1.2 ? [-1, 0, 1] : [-1, 1];
      const frame = Math.min(0.05, length * 0.03);
      for (const side of frames) {
        const offset = side * (length / 2 - frame / 2) * 0.95;
        pieces.push([
          "metal",
          at(new BoxGeometry(frame, seat - slat, depth * 0.8), offset, bottom + (seat - slat) / 2, depth * 0.05),
        ]);
        pieces.push(["metal", at(new BoxGeometry(frame, height, depth * 0.06), offset, 0, -depth / 2 + depth * 0.03)]);
      }
      return pieces;
    }),
  );
}

// A shelf: two side panels, a back panel and evenly spaced boards.
export function shelf({ x, y, z }: Extents): StylePart[] {
  const side = Math.min(x * 0.05, 0.03);
  const board = Math.min(y * 0.03, 0.03);
  const levels = Math.max(2, Math.min(8, Math.round(y / 0.45)));
  const pieces: Piece[] = [["shade", at(new BoxGeometry(x, y, z * 0.04), 0, 0, -z / 2 + z * 0.02)]];
  for (const sx of [-1, 1]) {
    pieces.push(["wood", at(new BoxGeometry(side, y, z), sx * (x / 2 - side / 2), 0, 0)]);
  }
  for (let index = 0; index < levels; index += 1) {
    const height = -y / 2 + board / 2 + (index * (y - board)) / (levels - 1);
    pieces.push(["wood", at(new BoxGeometry(x - 2 * side, board, z * 0.96), 0, height, z * 0.02)]);
  }
  return mergeByFinish(pieces);
}
