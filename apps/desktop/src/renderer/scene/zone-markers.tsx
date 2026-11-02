import type { SceneZone } from "@icarus/contracts";
import { DoubleSide } from "three";
import { ZONE_OPACITY } from "./scene-materials.ts";
import {
  DISC_SEGMENTS,
  RING_SEGMENTS,
  SPAWN_RING_INNER,
  SPAWN_RING_OPACITY,
  type ZoneTone,
  zoneMarker,
} from "./zone-marker.ts";

export type ZoneColors = Record<ZoneTone, string>;

const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0];

function ZoneMesh({ zone, colors }: { zone: SceneZone; colors: ZoneColors }) {
  const marker = zoneMarker(zone);
  const color = colors[marker.tone];
  switch (marker.kind) {
    case "disc":
      return (
        <mesh position={marker.position} rotation={FLAT} raycast={() => undefined}>
          <circleGeometry args={[marker.radius, DISC_SEGMENTS]} />
          <meshBasicMaterial color={color} transparent opacity={ZONE_OPACITY} depthWrite={false} />
        </mesh>
      );
    case "ring":
      return (
        <mesh position={marker.position} rotation={FLAT} raycast={() => undefined}>
          <ringGeometry args={[marker.radius * SPAWN_RING_INNER, marker.radius, RING_SEGMENTS]} />
          <meshBasicMaterial
            color={color}
            side={DoubleSide}
            transparent
            opacity={SPAWN_RING_OPACITY}
            depthWrite={false}
          />
        </mesh>
      );
    case "box":
      return (
        <mesh position={marker.position} raycast={() => undefined}>
          <boxGeometry args={marker.size} />
          <meshBasicMaterial color={color} transparent opacity={ZONE_OPACITY} depthWrite={false} />
        </mesh>
      );
  }
}

// Where the task starts and ends, painted on the ground; markers never catch clicks.
export function ZoneMarkers({ zones, colors }: { zones: readonly SceneZone[]; colors: ZoneColors }) {
  return (
    <>
      {zones.map((zone) => (
        <ZoneMesh key={zone.name} zone={zone} colors={colors} />
      ))}
    </>
  );
}
