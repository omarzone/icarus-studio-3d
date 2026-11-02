import type { SceneGeom } from "@icarus/contracts";

// Three geometry arguments for a MuJoCo geom: MuJoCo local z (the axis of cylinders and capsules) is Three's y.
export type GeomShapeArgs =
  | { kind: "box"; args: [width: number, height: number, depth: number] }
  | { kind: "sphere"; args: [radius: number, widthSegments: number, heightSegments: number] }
  | { kind: "cylinder"; args: [radiusTop: number, radiusBottom: number, height: number, radialSegments: number] }
  | { kind: "capsule"; args: [radius: number, length: number, capSegments: number, radialSegments: number] };

export function geomShape(geom: SceneGeom): GeomShapeArgs {
  const [x, y, z] = geom.size;
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
  }
}
