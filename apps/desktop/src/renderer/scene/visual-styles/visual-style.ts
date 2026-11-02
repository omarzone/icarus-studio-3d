import type { SceneGeom } from "@icarus/contracts";
import { carBody } from "./car-body.ts";
import { ball, cone, crate, curb, lampPost, marking, post, tree, wall } from "./props.ts";
import { joint, shell } from "./robot.ts";
import type { Extents, StylePart } from "./style-parts.ts";
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
  }
}
