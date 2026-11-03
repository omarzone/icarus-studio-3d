import { carBody } from "./car-body.ts";
import { type Extents, mergeByFinish, type Piece, piecesOf, type StylePart } from "./style-parts.ts";
import { wheel } from "./wheel.ts";

// A vehicle body raised over four wheels inside one box; `axles` is how far from the middle each axle sits, as a
// share of the length.
export function onWheels({ x, y, z }: Extents, body: (extents: Extents) => StylePart[], axles = 0.32): StylePart[] {
  const radius = Math.min(y * 0.24, x * 0.09, z * 0.25);
  const clearance = radius * 0.7;
  const tire = z * 0.13;
  const pieces: Piece[] = piecesOf(body({ x, y: y - clearance, z: z * 0.94 }), 0, clearance / 2, 0);
  const rolling = wheel({ x: radius * 2, y: tire, z: radius * 2 });
  for (const [wheelX, wheelZ] of [
    [x * axles, 1],
    [x * axles, -1],
    [-x * axles, 1],
    [-x * axles, -1],
  ] as const) {
    for (const [finish, geometry] of piecesOf(rolling, 0, 0, 0)) {
      // The wheel's axle is its own y; a car's axles run across it (z).
      const turned = geometry.rotateX(Math.PI / 2).translate(wheelX, -y / 2 + radius, wheelZ * (z / 2 - tire / 2));
      pieces.push([finish, turned]);
    }
  }
  return mergeByFinish(pieces);
}

// A parked car inside one box: the car body raised over four wheels, all within the collider.
export function parkedCar(extents: Extents): StylePart[] {
  return onWheels(extents, carBody);
}
