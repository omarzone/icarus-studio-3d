import type { SceneGeom } from "@icarus/contracts";
import { building, garage, house } from "./buildings.ts";
import { carBody } from "./car-body.ts";
import { bench, shelf, table } from "./furniture.ts";
import { bush, rock } from "./nature.ts";
import { parkedCar } from "./parked-car.ts";
import { ball, barrel, cone, crate, crateStack, curb, lampPost, marking, post, tree, wall } from "./props.ts";
import { crosswalk, dashedLine, parkingMark, roadArrow } from "./road-paint.ts";
import { joint, shell } from "./robot.ts";
import { bin, gatePost, hydrant, planter, pole, sidewalk, trunk } from "./street-furniture.ts";
import { barrier, fence, puddle, sign, speedBump, wheelStop } from "./street-props.ts";
import { pillar, planks, slab, stairs, step } from "./structures.ts";
import type { Extents, StylePart } from "./style-parts.ts";
import { hatchback, pickup, suv } from "./vehicles.ts";
import { wheel } from "./wheel.ts";

export type { StylePart } from "./style-parts.ts";

// A geom's full extents in its own Three.js frame (MuJoCo local z, the axis of cylinders, is Three's y).
export function geomExtents({ size: [x, y, z] }: SceneGeom): Extents {
  return { x, y: z, z: y };
}

const round = (shape: SceneGeom["shape"]) => shape === "cylinder" || shape === "capsule";

// The pieces a styled geom is drawn with, or null to draw its plain primitive: no style, or a style that does not fit
// the shape (a wheel needs a cylinder). Every piece stays inside the geom's extents, so the drawing never shows more
// than the collider MuJoCo simulates.
export function styleParts(geom: SceneGeom): StylePart[] | null {
  const extents = geomExtents(geom);
  const { shape } = geom;
  switch (geom.style) {
    case undefined:
    case null:
    case "plain":
      return null;
    case "car_body":
      return shape === "box" ? carBody(extents) : null;
    case "wheel":
      return shape === "cylinder" ? wheel(extents) : null;
    case "shell":
      return shell(shape, extents);
    case "joint":
      return joint(shape, extents);
    case "crate":
      return shape === "box" ? crate(extents) : null;
    case "wall":
      return shape === "box" ? wall(extents) : null;
    case "curb":
      return shape === "box" ? curb(extents) : null;
    case "post":
      return round(shape) ? post(extents) : null;
    case "cone":
      return round(shape) || shape === "box" ? cone(extents) : null;
    case "lamp_post":
      return round(shape) ? lampPost(extents) : null;
    case "tree":
      return round(shape) || shape === "box" ? tree(extents) : null;
    case "ball":
      return shape === "sphere" ? ball(extents) : null;
    case "marking":
      return shape === "box" || shape === "plane" ? marking(extents) : null;
    case "stairs":
      return shape === "box" ? stairs(extents) : null;
    case "step":
      return shape === "box" ? step(extents) : null;
    case "slab":
      return shape === "box" ? slab(extents) : null;
    case "pillar":
      return round(shape) || shape === "box" ? pillar(extents, round(shape)) : null;
    case "planks":
      return shape === "box" ? planks(extents) : null;
    case "speed_bump":
      return shape === "box" ? speedBump(extents) : null;
    case "wheel_stop":
      return shape === "box" ? wheelStop(extents) : null;
    case "barrier":
      return shape === "box" ? barrier(extents) : null;
    case "fence":
      return shape === "box" ? fence(extents) : null;
    case "sign":
      return shape === "box" ? sign(extents) : null;
    case "building":
      return shape === "box" ? building(extents) : null;
    case "house":
      return shape === "box" ? house(extents) : null;
    case "garage":
      return shape === "box" ? garage(extents) : null;
    case "table":
      return shape === "box" ? table(extents) : null;
    case "bench":
      return shape === "box" ? bench(extents) : null;
    case "shelf":
      return shape === "box" ? shelf(extents) : null;
    case "bush":
      return shape === "box" || shape === "sphere" || round(shape) ? bush(extents) : null;
    case "rock":
      return shape === "box" || shape === "sphere" ? rock(extents) : null;
    case "barrel":
      return round(shape) ? barrel(extents) : null;
    case "crate_stack":
      return shape === "box" ? crateStack(extents) : null;
    case "puddle":
      return shape === "box" ? puddle(extents) : null;
    case "parked_car":
      return shape === "box" ? parkedCar(extents) : null;
    case "trunk":
      return round(shape) ? trunk(extents) : null;
    case "pole":
      return round(shape) ? pole(extents) : null;
    case "gate_post":
      return shape === "box" ? gatePost(extents) : null;
    case "pickup":
      return shape === "box" ? pickup(extents) : null;
    case "hatchback":
      return shape === "box" ? hatchback(extents) : null;
    case "suv":
      return shape === "box" ? suv(extents) : null;
    case "bin":
      return round(shape) ? bin(extents) : null;
    case "hydrant":
      return round(shape) ? hydrant(extents) : null;
    case "planter":
      return shape === "box" ? planter(extents) : null;
    case "sidewalk":
      return shape === "box" ? sidewalk(extents) : null;
    case "crosswalk":
      return shape === "box" ? crosswalk(extents) : null;
    case "dashed_line":
      return shape === "box" ? dashedLine(extents) : null;
    case "parking_mark":
      return shape === "box" ? parkingMark(extents) : null;
    case "road_arrow":
      return shape === "box" ? roadArrow(extents) : null;
  }
}
