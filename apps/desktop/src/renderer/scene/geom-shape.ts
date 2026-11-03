import type { SceneGeom } from "@icarus/contracts";
import { drawnSize } from "./ground-geom.ts";
import type { WedgeShape } from "./wedge-geometry.ts";

// Three geometry arguments for a MuJoCo geom: MuJoCo local z (the axis of cylinders and capsules) is Three's y.
export type GeomShapeArgs =
  | { kind: "box"; args: [width: number, height: number, depth: number] }
  | { kind: "sphere"; args: [radius: number, widthSegments: number, heightSegments: number] }
  | { kind: "cylinder"; args: [radiusTop: number, radiusBottom: number, height: number, radialSegments: number] }
  | { kind: "capsule"; args: [radius: number, length: number, capSegments: number, radialSegments: number] }
  | { kind: "wedge"; shape: WedgeShape; size: [x: number, y: number, z: number] };

export function geomShape(geom: SceneGeom): GeomShapeArgs {
  const [x, y, z] = drawnSize(geom);
  switch (geom.shape) {
    case "box":
      return { kind: "box", args: [x, z, y] };
    case "sphere":
      return { kind: "sphere", args: [x / 2, 32, 16] };
    case "cylinder":
      return { kind: "cylinder", args: [x / 2, x / 2, z, 32] };
    case "capsule":
      return { kind: "capsule", args: [x / 2, Math.max(z - x, 0.001), 8, 16] };
    case "plane":
      return { kind: "box", args: [x, 0.002, y] };
    case "wedge":
    case "corner_wedge":
      return { kind: "wedge", shape: geom.shape, size: [x, y, z] };
  }
}

// Radius of a box's rounded edges as drawn: never more than a third of its thinnest side, and none for other shapes.
export function bevelRadius(geom: Pick<SceneGeom, "shape" | "size" | "bevel">): number {
  if (geom.shape !== "box" || !geom.bevel || geom.bevel <= 0) {
    return 0;
  }
  return Math.min(geom.bevel, Math.min(...geom.size) / 3);
}
