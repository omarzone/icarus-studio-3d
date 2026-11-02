import type { SceneGeom } from "@icarus/contracts";
import { geomShape } from "./geom-shape.ts";

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
  }
}
