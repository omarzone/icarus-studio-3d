import type { SceneZone } from "@icarus/contracts";
import { DoubleSide } from "three";
import { ZONE_OPACITY } from "./scene-materials.ts";
import { type ZoneTone, zoneMarker } from "./zone-marker.ts";

type ZoneColors = Record<ZoneTone, string>;

const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0];

function ZoneMesh({ zone, colors }: { zone: SceneZone; colors: ZoneColors }) {
  const marker = zoneMarker(zone);
  const color = colors[marker.tone];
  switch (marker.kind) {
    case "disc":
      return (
        <mesh position={marker.position} rotation={FLAT} raycast={() => undefined}>
          <circleGeometry args={[marker.radius, 48]} />
          <meshBasicMaterial color={color} transparent opacity={ZONE_OPACITY} depthWrite={false} />
        </mesh>
      );
    case "ring":
      return (
        <mesh position={marker.position} rotation={FLAT} raycast={() => undefined}>
          <ringGeometry args={[marker.radius * 0.75, marker.radius, 32]} />
          <meshBasicMaterial color={color} side={DoubleSide} transparent opacity={0.8} depthWrite={false} />
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
