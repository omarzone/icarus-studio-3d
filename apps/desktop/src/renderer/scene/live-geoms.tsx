import type { SceneGeom } from "@icarus/contracts";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import { type Object3D, Quaternion } from "three";
import { fromThreePosition, toThreePosition, toThreeQuaternion } from "./coordinates.ts";
import { geomObject, lampGlow } from "./geom-object.ts";
import type { PosePlayer } from "./motion-player.ts";
import { isDeliberateClick } from "./pick.ts";
import { heldTrack, lerpPosition, nextTrack, type Poses, type PoseTrack, trackProgress } from "./pose-track.ts";
import { copyOf, lampOn, type SignalFeed } from "./scene-signals.ts";

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

// Geoms placed by the engine's frames (drawn in their styles, see geom-object.ts), eased from one frame to the next; clicks report picks instead of selecting.
// `track` is shared with the camera, which follows the same eased poses. With a `player`, the geoms follow its
// recorded motion instead, and `track` holds what it played this frame. Vehicle lamps glow while `feed` says
// their light is on, for the copy (of `copies` side by side) they belong to.
export function LiveGeoms({
  geoms,
  poses,
  player,
  track,
  onPick,
  feed,
  copies = 1,
}: {
  geoms: readonly SceneGeom[];
  poses: Poses;
  player?: PosePlayer;
  track: RefObject<PoseTrack | null>;
  onPick: (pick: ScenePick) => void;
  feed?: SignalFeed;
  copies?: number;
}) {
  const meshes = useRef(new Map<string, Object3D>());
  const lamps = useMemo(
    () =>
      geoms.flatMap((geom) =>
        geom.light_role ? [{ name: geom.name, role: geom.light_role, copy: copyOf(geom.name, copies) }] : [],
      ),
    [geoms, copies],
  );
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);
  useEffect(() => {
    if (!player) {
      track.current = nextTrack(track.current, poses, performance.now());
    }
  }, [poses, track, player]);
  useFrame(() => {
    if (feed && lamps.length > 0) {
      const signals = feed(performance.now());
      for (const lamp of lamps) {
        const mesh = meshes.current.get(lamp.name);
        if (mesh) {
          lampGlow(mesh, lampOn(lamp.role, signals[lamp.copy]));
        }
      }
    }
    if (player) {
      track.current = heldTrack(player.at(performance.now()).poses);
    }
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
          <primitive
            key={geom.name}
            object={geomObject(geom)}
            ref={(object: Object3D | null) => {
              if (object) {
                meshes.current.set(geom.name, object);
              } else {
                meshes.current.delete(geom.name);
              }
            }}
            onClick={(event: ThreeEvent<MouseEvent>) => {
              event.stopPropagation();
              if (isDeliberateClick(event.delta)) {
                pick.current(pickOf(geom.shape === "plane" ? null : geom.body, event));
              }
            }}
          />
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
