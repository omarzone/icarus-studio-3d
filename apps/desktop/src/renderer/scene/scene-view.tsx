import type { SceneDescription, SceneGeom } from "@icarus/contracts";
import { Edges, GizmoHelper, GizmoViewcube, Grid, OrbitControls, TransformControls } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Group, type Mesh, Quaternion } from "three";
import { fromThreePosition, toThreePosition, toThreeQuaternion } from "./coordinates.ts";
import { isDeliberateClick } from "./pick.ts";
import { lerpPosition, nextTrack, type Poses, type PoseTrack, trackProgress } from "./pose-track.ts";
import { sceneColors } from "./scene-materials.ts";

type Vec3 = [number, number, number];

// A click in a Play view: the object hit (null for the ground), where, and the horizontal look direction (MuJoCo axes).
export type ScenePick = { object: string | null; point: Vec3; direction: Vec3 };

type EditProps = {
  mode?: "edit";
  selected: string | null;
  onSelect: (objectId: string | null) => void;
  // A drag of the selected object ended; the move is in MuJoCo world axes.
  onMove: (objectId: string, delta: Vec3) => void;
};

type PlayProps = {
  mode: "play";
  // Engine poses that override each geom's place; geoms without one stay where the description has them.
  poses: Poses;
  onPick: (pick: ScenePick) => void;
};

// Width in metres the camera starts out framing (every copy of a training run); the default frames one world.
export type SceneViewProps = { description: SceneDescription; framing?: number } & (EditProps | PlayProps);

const CAMERA: Vec3 = [7, 6, 9];
const CAMERA_FRAMES = 12;

// Three's local axes for a MuJoCo geom: MuJoCo local z (the axis of cylinders and capsules) is Three's y.
function GeomShape({ geom }: { geom: SceneGeom }) {
  const [x, y, z] = geom.size;
  switch (geom.shape) {
    case "box":
      return <boxGeometry args={[x, z, y]} />;
    case "sphere":
      return <sphereGeometry args={[x / 2, 32, 16]} />;
    case "cylinder":
      return <cylinderGeometry args={[x / 2, x / 2, z, 32]} />;
    case "capsule":
      return <capsuleGeometry args={[x / 2, Math.max(z - x, 0.001), 8, 16]} />;
    case "plane":
      return <boxGeometry args={[x, 0.002, y]} />;
  }
}

type GeomProps = {
  geom: SceneGeom;
  selected: boolean;
  onSelect: (id: string) => void;
  // Three position the geom is drawn relative to (its body, while it can be dragged).
  origin?: readonly [number, number, number];
};

function Geom({ geom, selected, onSelect, origin = [0, 0, 0] }: GeomProps) {
  const colors = useMemo(sceneColors, []);
  const [x, y, z] = toThreePosition(geom.position);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a Three.js mesh, not a DOM element; the explorer is the accessible way to select.
    <mesh
      position={[x - origin[0], y - origin[1], z - origin[2]]}
      quaternion={toThreeQuaternion(geom.quaternion)}
      onClick={(event) => {
        event.stopPropagation();
        if (isDeliberateClick(event.delta)) {
          onSelect(geom.body);
        }
      }}
    >
      <GeomShape geom={geom} />
      <meshStandardMaterial color={geom.color} roughness={0.8} />
      {selected ? <Edges color={colors.selected} /> : null}
    </mesh>
  );
}

function EditGeoms({ description, selected, onSelect, onMove }: { description: SceneDescription } & EditProps) {
  const [dragged, setDragged] = useState<Group | null>(null);
  const picked = description.geoms.filter((geom) => geom.body === selected);
  const body = description.bodies.find((item) => item.name === selected);
  const anchor = body ? toThreePosition(body.position) : null;
  const rest = description.geoms.filter((geom) => geom.body !== selected);
  return (
    <>
      {rest.map((geom) => (
        <Geom key={geom.name} geom={geom} selected={false} onSelect={onSelect} />
      ))}
      {selected && anchor && picked.length > 0 ? (
        <>
          <group ref={setDragged} position={anchor}>
            {picked.map((geom) => (
              <Geom key={geom.name} geom={geom} selected onSelect={onSelect} origin={anchor} />
            ))}
          </group>
          {/* Attached to the group above (not a wrapper of its own), so the drag moves what is read on release. */}
          <TransformControls
            object={dragged ?? undefined}
            mode="translate"
            onMouseUp={() => {
              const group = dragged;
              if (!group) {
                return;
              }
              const delta = fromThreePosition([
                group.position.x - anchor[0],
                group.position.y - anchor[1],
                group.position.z - anchor[2],
              ]);
              // Back to where the engine has it; the engine's answer moves it for real.
              group.position.set(anchor[0], anchor[1], anchor[2]);
              if (delta.some((value) => Math.abs(value) > 1e-6)) {
                onMove(selected, delta);
              }
            }}
          />
        </>
      ) : null}
    </>
  );
}

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
function LiveGeoms({
  geoms,
  poses,
  onPick,
}: {
  geoms: readonly SceneGeom[];
  poses: Poses;
  onPick: PlayProps["onPick"];
}) {
  const meshes = useRef(new Map<string, Mesh>());
  const track = useRef<PoseTrack | null>(null);
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);
  useEffect(() => {
    track.current = nextTrack(track.current, poses, performance.now());
  }, [poses]);
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
            <meshStandardMaterial color={geom.color} roughness={0.8} />
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

// Draws the engine's compiled scene; it never moves anything itself, a drag or a pick only reports what was done.
export default function SceneView(props: SceneViewProps) {
  const colors = useMemo(sceneColors, []);
  const { description, framing = CAMERA_FRAMES } = props;
  const scale = Math.max(1, framing / CAMERA_FRAMES);
  return (
    <Canvas
      camera={{ position: [CAMERA[0] * scale, CAMERA[1] * scale, CAMERA[2] * scale], fov: 45 }}
      dpr={[1, 2]}
      onPointerMissed={() => (props.mode === "play" ? undefined : props.onSelect(null))}
    >
      <color attach="background" args={[colors.background]} />
      <ambientLight intensity={0.5} />
      {description.lights.map((light) => (
        <directionalLight
          key={light.name}
          position={toThreePosition([-light.direction[0] * 10, -light.direction[1] * 10, -light.direction[2] * 10])}
          intensity={Math.max(light.intensity, 0.2) * 2}
        />
      ))}
      <Grid
        infiniteGrid
        cellColor={colors.grid}
        sectionColor={colors.gridStrong}
        fadeDistance={60 * scale}
        position={[0, 0.001, 0]}
      />
      {props.mode === "play" ? (
        <LiveGeoms geoms={description.geoms} poses={props.poses} onPick={props.onPick} />
      ) : (
        <EditGeoms {...props} />
      )}
      <OrbitControls makeDefault />
      {props.mode === "play" ? null : (
        <GizmoHelper alignment="top-right" margin={[72, 72]}>
          <GizmoViewcube />
        </GizmoHelper>
      )}
    </Canvas>
  );
}
