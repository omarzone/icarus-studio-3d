import type { SceneZone } from "@icarus/contracts";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { DoubleSide, type MeshBasicMaterial } from "three";
import { SPOT_OPACITY, ZONE_OPACITY } from "./scene-materials.ts";
import { copyOf, goalMet, type SignalFeed } from "./scene-signals.ts";
import {
  DISC_SEGMENTS,
  RING_SEGMENTS,
  SPAWN_RING_INNER,
  SPAWN_RING_OPACITY,
  type ZoneMarker,
  type ZoneTone,
  zoneMarker,
} from "./zone-marker.ts";
import { spotGeometry } from "./zone-mesh.ts";

export type ZoneColors = Record<ZoneTone, string>;

const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0];

type SpotProps = {
  zone: SceneZone;
  marker: Extract<ZoneMarker, { kind: "spot" }>;
  colors: ZoneColors;
  feed?: SignalFeed;
  copies: number;
};

// A rectangular spot outlined red until the engine reports every rule of the goal holding, then green.
function SpotOutline({ zone, marker, colors, feed, copies }: SpotProps) {
  const material = useRef<MeshBasicMaterial>(null);
  const geometry = useMemo(() => spotGeometry(marker.length, marker.width), [marker.length, marker.width]);
  const copy = copyOf(zone.name, copies);
  useFrame(() => {
    const met = feed ? goalMet(feed(performance.now())[copy]) : false;
    material.current?.color.set(met ? colors.goal : colors.spot);
  });
  return (
    <mesh
      position={marker.position}
      rotation={[-Math.PI / 2, 0, marker.yaw]}
      geometry={geometry}
      raycast={() => undefined}
    >
      <meshBasicMaterial
        ref={material}
        color={colors.spot}
        side={DoubleSide}
        transparent
        opacity={SPOT_OPACITY}
        depthWrite={false}
      />
    </mesh>
  );
}

function ZoneMesh({
  zone,
  colors,
  feed,
  copies,
}: {
  zone: SceneZone;
  colors: ZoneColors;
  feed?: SignalFeed;
  copies: number;
}) {
  const marker = zoneMarker(zone);
  const color = colors[marker.tone];
  switch (marker.kind) {
    case "spot":
      return <SpotOutline zone={zone} marker={marker} colors={colors} feed={feed} copies={copies} />;
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

// Where the task starts and ends, painted on the ground; markers never catch clicks. `feed` gives the goal states
// the engine measured, per copy when `copies` worlds stand side by side.
export function ZoneMarkers({
  zones,
  colors,
  feed,
  copies = 1,
}: {
  zones: readonly SceneZone[];
  colors: ZoneColors;
  feed?: SignalFeed;
  copies?: number;
}) {
  return (
    <>
      {zones.map((zone) => (
        <ZoneMesh key={zone.name} zone={zone} colors={colors} feed={feed} copies={copies} />
      ))}
    </>
  );
}
