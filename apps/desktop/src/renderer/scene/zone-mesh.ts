import type { SceneZone } from "@icarus/contracts";
import {
  BoxGeometry,
  type BufferGeometry,
  CircleGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
} from "three";
import { ZONE_OPACITY } from "./scene-materials.ts";
import {
  DISC_SEGMENTS,
  RING_SEGMENTS,
  SPAWN_RING_INNER,
  SPAWN_RING_OPACITY,
  type ZoneMarker,
  type ZoneTone,
  zoneMarker,
} from "./zone-marker.ts";

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
  }
}

// The same markers as `ZoneMarkers`, as plain Three.js meshes for pictures drawn outside React (thumbnails).
export function zoneMesh(zone: SceneZone, colors: Record<ZoneTone, string>): Mesh<BufferGeometry, MeshBasicMaterial> {
  const marker = zoneMarker(zone);
  const mesh = markerMesh(marker, colors[marker.tone]);
  mesh.position.set(...marker.position);
  if (marker.kind !== "box") {
    mesh.rotation.set(-Math.PI / 2, 0, 0);
  }
  return mesh;
}
