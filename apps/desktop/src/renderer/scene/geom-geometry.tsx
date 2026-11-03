import type { SceneGeom } from "@icarus/contracts";
import { useMemo } from "react";
import { geomShape } from "./geom-shape.ts";
import { type WedgeShape, wedgeGeometry } from "./wedge-geometry.ts";

// The Three.js geometry of one engine geom, sized from its full extents.
export function GeomShape({ geom }: { geom: SceneGeom }) {
  const shape = geomShape(geom);
  switch (shape.kind) {
    case "box":
      return <boxGeometry args={shape.args} />;
    case "sphere":
      return <sphereGeometry args={shape.args} />;
    case "cylinder":
      return <cylinderGeometry args={shape.args} />;
    case "capsule":
      return <capsuleGeometry args={shape.args} />;
    case "wedge":
      return <WedgeShapeGeometry shape={shape.shape} size={shape.size} />;
  }
}

function WedgeShapeGeometry({ shape, size }: { shape: WedgeShape; size: [number, number, number] }) {
  const [x, y, z] = size;
  const geometry = useMemo(() => wedgeGeometry(shape, [x, y, z]), [shape, x, y, z]);
  return <primitive object={geometry} attach="geometry" />;
}
