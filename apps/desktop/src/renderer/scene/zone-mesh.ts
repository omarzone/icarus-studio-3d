import type { SceneZone } from "@icarus/contracts";
import {
  BoxGeometry,
  type BufferGeometry,
  CircleGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Path,
  RingGeometry,
  Shape,
  ShapeGeometry,
} from "three";
import { SPOT_OPACITY, ZONE_OPACITY } from "./scene-materials.ts";
import {
  DISC_SEGMENTS,
  RING_SEGMENTS,
  SPAWN_RING_INNER,
  SPAWN_RING_OPACITY,
  SPOT_LINE,
  type ZoneMarker,
  type ZoneTone,
  zoneMarker,
} from "./zone-marker.ts";

// A rectangular frame SPOT_LINE wide just inside a length × width spot, flat in its own XY plane (x along the
// spot's heading, y to its left), so laying it on the ground keeps MuJoCo's x and y.
export function spotGeometry(length: number, width: number): ShapeGeometry {
  const [x, y] = [length / 2, width / 2];
  const line = Math.min(SPOT_LINE, x / 2, y / 2);
  const outline = new Shape().moveTo(-x, -y).lineTo(x, -y).lineTo(x, y).lineTo(-x, y).closePath();
  const inner = new Path()
    .moveTo(-x + line, -y + line)
    .lineTo(-x + line, y - line)
    .lineTo(x - line, y - line)
    .lineTo(x - line, -y + line)
    .closePath();
  outline.holes.push(inner);
  return new ShapeGeometry(outline);
}

function markerMesh(marker: ZoneMarker, color: string): Mesh<BufferGeometry, MeshBasicMaterial> {
  const look = { color, transparent: true, depthWrite: false };
  switch (marker.kind) {
    case "disc":
      return new Mesh(
        new CircleGeometry(marker.radius, DISC_SEGMENTS),
        new MeshBasicMaterial({ ...look, opacity: ZONE_OPACITY }),
      );
    case "ring":
      return new Mesh(
        new RingGeometry(marker.radius * SPAWN_RING_INNER, marker.radius, RING_SEGMENTS),
        new MeshBasicMaterial({ ...look, opacity: SPAWN_RING_OPACITY, side: DoubleSide }),
      );
    case "box":
      return new Mesh(new BoxGeometry(...marker.size), new MeshBasicMaterial({ ...look, opacity: ZONE_OPACITY }));
    case "spot":
      return new Mesh(
        spotGeometry(marker.length, marker.width),
        new MeshBasicMaterial({ ...look, opacity: SPOT_OPACITY, side: DoubleSide }),
      );
  }
}

// The same markers as `ZoneMarkers`, as plain Three.js meshes for pictures drawn outside React (thumbnails).
export function zoneMesh(zone: SceneZone, colors: Record<ZoneTone, string>): Mesh<BufferGeometry, MeshBasicMaterial> {
  const marker = zoneMarker(zone);
  const mesh = markerMesh(marker, colors[marker.tone]);
  mesh.position.set(...marker.position);
  if (marker.kind !== "box") {
    // Turned in its own plane first, then laid flat: the spot's heading becomes a turn about the vertical.
    mesh.rotation.set(-Math.PI / 2, 0, marker.kind === "spot" ? marker.yaw : 0);
  }
  return mesh;
}
