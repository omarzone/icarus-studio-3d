import type { SceneGeom } from "@icarus/contracts";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import { type Mesh, Quaternion } from "three";
import { fromThreePosition, toThreePosition, toThreeQuaternion } from "./coordinates.ts";
import { GeomShape } from "./geom-geometry.tsx";
import { isDeliberateClick } from "./pick.ts";
import { lerpPosition, nextTrack, type Poses, type PoseTrack, trackProgress } from "./pose-track.ts";
import { floorDepth, GEOM_ROUGHNESS } from "./scene-materials.ts";

type Vec3 = [number, number, number];

// A click in a Play view: the object hit (null for the ground), where, and the horizontal look direction (MuJoCo axes).
export type ScenePick = { object: string | null; point: Vec3; direction: Vec3 };

function pickOf(object: string | null, event: ThreeEvent<MouseEvent>): ScenePick {
  const [dx, dy] = fromThreePosition([event.ray.direction.x, event.ray.direction.y, event.ray.direction.z]);
  const length = Math.hypot(dx, dy);
  return {
    object,
    point: fromThreePosition([event.point.x, event.point.y, event.point.z]),
    direction: length > 1e-6 ? [dx / length, dy / length, 0] : [1, 0, 0],
  };
}

const from = new Quaternion();
const to = new Quaternion();

// Geoms placed by the engine's frames, eased from one frame to the next; clicks report picks instead of selecting.
// `track` is shared with the camera, which follows the same eased poses.
export function LiveGeoms({
  geoms,
  poses,
  track,
  onPick,
}: {
  geoms: readonly SceneGeom[];
  poses: Poses;
  track: RefObject<PoseTrack | null>;
  onPick: (pick: ScenePick) => void;
}) {
  const meshes = useRef(new Map<string, Mesh>());
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);
  useEffect(() => {
    track.current = nextTrack(track.current, poses, performance.now());
  }, [poses, track]);
  useFrame(() => {
    const current = track.current;
    if (!current) {
      return;
    }
    const t = trackProgress(current, performance.now());
    for (const [name, mesh] of meshes.current) {
      const target = current.to.get(name);
      if (!target) {
        continue;
      }
      const start = current.from.get(name) ?? target;
      const [x, y, z] = toThreePosition(lerpPosition(start.position, target.position, t));
      mesh.position.set(x, y, z);
      from.set(...toThreeQuaternion(start.quaternion));
      to.set(...toThreeQuaternion(target.quaternion));
      mesh.quaternion.slerpQuaternions(from, to, t);
    }
  });
  // Built once per scene, so a new frame never re-renders the meshes; useFrame moves them.
  return useMemo(
    () => (
      <>
        {geoms.map((geom) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: a Three.js mesh, not a DOM element; the Play tool bar is the accessible control.
          <mesh
            key={geom.name}
            ref={(mesh) => {
              if (mesh) {
                meshes.current.set(geom.name, mesh);
              } else {
                meshes.current.delete(geom.name);
              }
            }}
            position={toThreePosition(geom.position)}
            quaternion={toThreeQuaternion(geom.quaternion)}
            onClick={(event) => {
              event.stopPropagation();
              if (isDeliberateClick(event.delta)) {
                pick.current(pickOf(geom.shape === "plane" ? null : geom.body, event));
              }
            }}
          >
            <GeomShape geom={geom} />
            <meshStandardMaterial color={geom.color} roughness={GEOM_ROUGHNESS} {...floorDepth(geom.shape)} />
          </mesh>
        ))}
        {/* Catches clicks on the ground beyond the floor geoms. */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: a Three.js mesh, not a DOM element. */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={(event) => {
            event.stopPropagation();
            if (isDeliberateClick(event.delta)) {
              pick.current(pickOf(null, event));
            }
          }}
        >
          <planeGeometry args={[400, 400]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </>
    ),
    [geoms],
  );
}
