import { BoxGeometry, type BufferGeometry, CylinderGeometry, LatheGeometry, Vector2 } from "three";
import type { Finish } from "./finishes.ts";
import { type Extents, mergeByFinish, type StylePart } from "./style-parts.ts";

const SPOKES = 5;

// The tire's cross-section turned around the axle (y): a rounded tread from the rim out to the full radius.
function tire(radius: number, width: number): BufferGeometry {
  const inner = radius * 0.64;
  const half = width / 2;
  const points = [
    [inner, -half * 0.9],
    [radius * 0.86, -half],
    [radius * 0.97, -half * 0.8],
    [radius, -half * 0.45],
    [radius, half * 0.45],
    [radius * 0.97, half * 0.8],
    [radius * 0.86, half],
    [inner, half * 0.9],
  ].map(([r = 0, y = 0]) => new Vector2(r, y));
  return new LatheGeometry(points, 40);
}

// A wheel inside its cylinder (axle along y): a tire, a metal rim barrel and spokes on both faces, so a turning
// wheel shows that it turns.
export function wheel({ x: diameter, y: width }: Extents): StylePart[] {
  const radius = diameter / 2;
  const rim = radius * 0.64;
  const pieces: Array<readonly [Finish, BufferGeometry]> = [
    ["rubber", tire(radius, width)],
    ["metal", new CylinderGeometry(rim, rim, width * 0.84, 32, 1, true)],
    ["metal", new CylinderGeometry(rim * 0.96, rim * 0.96, width * 0.5, 32)],
    ["chrome", new CylinderGeometry(radius * 0.16, radius * 0.16, width * 0.8, 16)],
  ];
  for (const face of [-1, 1]) {
    for (let index = 0; index < SPOKES; index += 1) {
      const angle = (index / SPOKES) * Math.PI * 2;
      const spoke = new BoxGeometry(rim * 0.8, width * 0.1, radius * 0.13);
      spoke.translate(rim * 0.5, face * width * 0.3, 0);
      spoke.rotateY(angle);
      pieces.push(["chrome", spoke]);
    }
  }
  return mergeByFinish(pieces);
}
