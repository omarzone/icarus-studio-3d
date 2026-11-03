import { BoxGeometry, CylinderGeometry, SphereGeometry } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { at, type Extents, mergeByFinish, type Piece, type StylePart } from "./style-parts.ts";

// A tree trunk inside its cylinder: tapering bark over a flared foot.
export function trunk({ x, y }: Extents): StylePart[] {
  const radius = x / 2;
  const foot = Math.min(y * 0.08, 0.3);
  return mergeByFinish([
    ["wood", at(new CylinderGeometry(radius * 0.7, radius * 0.85, y - foot, 9), 0, foot / 2, 0)],
    ["wood", at(new CylinderGeometry(radius * 0.85, radius, foot, 9), 0, -y / 2 + foot / 2, 0)],
  ]);
}

// A painted pole on a round foot plate, as a street light or a sign stands on.
export function pole({ x, y }: Extents): StylePart[] {
  const radius = x / 2;
  const foot = Math.min(y * 0.04, 0.25);
  return mergeByFinish([
    ["paint", at(new CylinderGeometry(radius * 0.55, radius * 0.7, y - foot, 16), 0, foot / 2, 0)],
    ["shade", at(new CylinderGeometry(radius * 0.9, radius, foot, 16), 0, -y / 2 + foot / 2, 0)],
  ]);
}

// The cabinet of a barrier gate: a painted housing with a dark cap and a band of warning red.
export function gatePost({ x, y, z }: Extents): StylePart[] {
  const cap = Math.min(y * 0.08, 0.08);
  const body = y - cap;
  return mergeByFinish([
    ["paint", at(new RoundedBoxGeometry(x * 0.92, body, z * 0.92, 2, Math.min(x, z) * 0.08), 0, -cap / 2, 0)],
    ["trim", at(new BoxGeometry(x, cap, z), 0, y / 2 - cap / 2, 0)],
    ["taillight", at(new BoxGeometry(x * 0.94, body * 0.08, z * 0.94), 0, y / 2 - cap - body * 0.12, 0)],
  ]);
}

// A street litter bin: a painted drum with a dark rim and opening.
export function bin({ x, y }: Extents): StylePart[] {
  const radius = x / 2;
  const rim = Math.min(y * 0.06, 0.05);
  return mergeByFinish([
    ["paint", at(new CylinderGeometry(radius * 0.92, radius * 0.82, y - rim, 20), 0, -rim / 2, 0)],
    ["trim", at(new CylinderGeometry(radius, radius, rim, 20), 0, y / 2 - rim / 2, 0)],
    ["shade", at(new CylinderGeometry(radius * 0.93, radius * 0.93, y * 0.08, 20), 0, -y * 0.1, 0)],
  ]);
}

// A fire hydrant: a flanged foot, a barrel with two side outlets and a domed bonnet.
export function hydrant({ x, y }: Extents): StylePart[] {
  const radius = x / 2;
  const foot = y * 0.08;
  const dome = Math.min(radius * 0.6, y * 0.12);
  const barrel = y - foot - dome;
  const pieces: Piece[] = [
    ["paint", at(new CylinderGeometry(radius * 0.8, radius * 0.9, foot, 16), 0, -y / 2 + foot / 2, 0)],
    ["paint", at(new CylinderGeometry(radius * 0.55, radius * 0.6, barrel, 16), 0, -y / 2 + foot + barrel / 2, 0)],
    ["paint", at(new SphereGeometry(dome, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, y / 2 - dome, 0)],
    ["metal", at(new CylinderGeometry(radius * 0.18, radius * 0.18, x, 10).rotateZ(Math.PI / 2), 0, y * 0.1, 0)],
  ];
  return mergeByFinish(pieces);
}

// A concrete planter: thick walls around dark soil (its plants are an ornament above it).
export function planter({ x, y, z }: Extents): StylePart[] {
  const wall = Math.min(x, z) * 0.1;
  return mergeByFinish([
    ["concrete", new RoundedBoxGeometry(x, y, z, 2, Math.min(wall * 0.5, y * 0.2))],
    ["trim", at(new BoxGeometry(x - 2 * wall, y * 0.04, z - 2 * wall), 0, y / 2 - y * 0.03, 0)],
  ]);
}

// A raised sidewalk: tiled paving inside a rounded curb along every edge.
export function sidewalk({ x, y, z }: Extents): StylePart[] {
  const curb = Math.min(0.2, Math.min(x, z) * 0.2);
  const round = Math.min(curb, y) * 0.35;
  return mergeByFinish([
    ["concrete", new BoxGeometry(x - 2 * curb, y * 0.98, z - 2 * curb)],
    ["stone", at(new RoundedBoxGeometry(x, y, curb, 2, round), 0, 0, z / 2 - curb / 2)],
    ["stone", at(new RoundedBoxGeometry(x, y, curb, 2, round), 0, 0, -z / 2 + curb / 2)],
    ["stone", at(new RoundedBoxGeometry(curb, y, z - 2 * curb, 2, round), x / 2 - curb / 2, 0, 0)],
    ["stone", at(new RoundedBoxGeometry(curb, y, z - 2 * curb, 2, round), -x / 2 + curb / 2, 0, 0)],
  ]);
}
