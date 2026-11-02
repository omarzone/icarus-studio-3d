import type { SceneDescription, SceneGeom, SceneRay } from "@icarus/contracts";
import { Edges, GizmoHelper, GizmoViewcube, Grid, OrbitControls, TransformControls } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { type KeyboardEvent, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Group } from "three";
import { type CameraView, CameraViewContext } from "./camera-mode.ts";
import { CameraRig, VIEW_FOV } from "./camera-rig.tsx";
import { fromThreePosition, toThreePosition, toThreeQuaternion } from "./coordinates.ts";
import { GeomShape } from "./geom-geometry.tsx";
import { geomGeometry, geomObject } from "./geom-object.ts";
import { LiveGeoms, type ScenePick } from "./live-geoms.tsx";
import { isDeliberateClick } from "./pick.ts";
import type { Poses, PoseTrack } from "./pose-track.ts";
import { RayOverlay } from "./ray-overlay.tsx";
import { groundColor, hemisphereLook, sunFrame } from "./scene-lighting.ts";
import { AMBIENT_INTENSITY, PROPOSAL_OPACITY, sceneColors } from "./scene-materials.ts";
import { SKY_RADIUS, type SkyLook, skyLook } from "./scene-sky.ts";
import { createSkyDome } from "./sky-dome.ts";
import { sunLight } from "./sun-light.ts";
import { sceneBounds } from "./thumbnail-framing.ts";
import { ZoneMarkers } from "./zone-markers.tsx";

export type { ScenePick } from "./live-geoms.tsx";

type Vec3 = [number, number, number];

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
// `ghosts` are geoms of a copilot proposal that is not applied yet, drawn see-through in the proposal color.
// Inside a viewport that asks for a camera (CameraViewContext) the camera frames the scene and follows the chosen
// mode, looking for the agent among the geoms `follows` accepts; elsewhere it keeps a fixed three-quarter start.
export type SceneViewProps = {
  description: SceneDescription;
  framing?: number;
  ghosts?: readonly SceneGeom[];
  follows?: (geom: SceneGeom) => boolean;
  // Distance sensors to draw (eased with the poses in a live view), with their readings when `rayValues`.
  rays?: readonly SceneRay[];
  rayValues?: boolean;
  // The orientation cube is for views you work in; previews only to look at leave it out.
  viewCube?: boolean;
} & (EditProps | PlayProps);

const CAMERA: Vec3 = [7, 6, 9];
const CAMERA_FRAMES = 12;

type GeomProps = {
  geom: SceneGeom;
  selected: boolean;
  onSelect: (id: string) => void;
  // Three position the geom is drawn relative to (its body, while it can be dragged).
  origin?: readonly [number, number, number];
};

function Geom({ geom, selected, onSelect, origin = [0, 0, 0] }: GeomProps) {
  const colors = useMemo(sceneColors, []);
  const object = useMemo(() => geomObject(geom), [geom]);
  const [x, y, z] = toThreePosition(geom.position);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a Three.js object, not a DOM element; the explorer is the accessible way to select.
    <primitive
      object={object}
      position={[x - origin[0], y - origin[1], z - origin[2]]}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        if (isDeliberateClick(event.delta)) {
          onSelect(geom.body);
        }
      }}
    >
      {/* The outline of a selected part is its collider, whatever style it is drawn in. */}
      {selected ? (
        <mesh geometry={geomGeometry(geom)} raycast={() => undefined}>
          <meshBasicMaterial visible={false} />
          <Edges color={colors.selected} />
        </mesh>
      ) : null}
    </primitive>
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

// Never picked: clicks go through a ghost to what is really there.
function GhostGeoms({ geoms, color }: { geoms: readonly SceneGeom[]; color: string }) {
  return (
    <>
      {geoms.map((geom) => (
        <mesh
          key={geom.name}
          position={toThreePosition(geom.position)}
          quaternion={toThreeQuaternion(geom.quaternion)}
          raycast={() => undefined}
          renderOrder={1}
        >
          <GeomShape geom={geom} />
          <meshStandardMaterial color={color} transparent opacity={PROPOSAL_OPACITY} depthWrite={false} />
          <Edges color={color} />
        </mesh>
      ))}
    </>
  );
}

// The world's sky: a gradient dome, its light from above and below and its haze; without one, the flat panel color of
// the editor.
function Sky({
  look,
  scale,
  background,
  ground,
}: {
  look: SkyLook | null;
  scale: number;
  background: string;
  ground: string;
}) {
  const hemisphere = hemisphereLook(look, ground, AMBIENT_INTENSITY);
  const dome = useMemo(() => (look ? createSkyDome(look, SKY_RADIUS * scale) : null), [look, scale]);
  useEffect(
    () => () => {
      dome?.geometry.dispose();
      dome?.material.dispose();
    },
    [dome],
  );
  return (
    <>
      <color attach="background" args={[look?.horizon ?? background]} />
      <hemisphereLight args={[hemisphere.sky, hemisphere.ground, hemisphere.intensity]} />
      {dome ? <primitive object={dome} /> : null}
      {look?.fog ? <fogExp2 attach="fog" args={[look.fog.color, look.fog.density]} /> : null}
    </>
  );
}

// The world's lights as suns aimed at what the scene shows; the first casts the soft shadows.
function Suns({ description }: { description: SceneDescription }) {
  const lights = useMemo(() => {
    const bounds = sceneBounds(description.geoms, description.zones ?? []);
    return description.lights.map((light, index) => sunLight(sunFrame(light, bounds), index === 0));
  }, [description]);
  useEffect(
    () => () => {
      for (const light of lights) {
        light.dispose();
      }
    },
    [lights],
  );
  return (
    <>
      {lights.map((light) => (
        <group key={light.uuid}>
          <primitive object={light} />
          <primitive object={light.target} />
        </group>
      ))}
    </>
  );
}

function frameOnKey(view: CameraView | null) {
  return (event: KeyboardEvent<HTMLDivElement>) => {
    if (view && (event.key === "f" || event.key === "F") && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      view.onFrameAll();
    }
  };
}

// Draws the engine's compiled scene; it never moves anything itself, a drag or a pick only reports what was done.
export default function SceneView(props: SceneViewProps) {
  const colors = useMemo(sceneColors, []);
  const { description, framing = CAMERA_FRAMES, follows, viewCube = true } = props;
  const view = useContext(CameraViewContext);
  const scale = Math.max(1, framing / CAMERA_FRAMES);
  const track = useRef<PoseTrack | null>(null);
  const look = useMemo(() => skyLook(description.sky, scale), [description.sky, scale]);
  // One object per scale, so a re-render never puts the camera back where it started.
  const start = useMemo(
    () => ({
      position: [CAMERA[0] * scale, CAMERA[1] * scale, CAMERA[2] * scale] satisfies Vec3,
      fov: VIEW_FOV,
      near: 0.1,
      far: 500 * scale,
    }),
    [scale],
  );
  return (
    <Canvas
      shadows="percentage"
      camera={start}
      dpr={[1, 2]}
      tabIndex={view ? 0 : undefined}
      aria-label={view ? "3D view, press F to frame everything" : undefined}
      onKeyDown={frameOnKey(view)}
      onPointerMissed={() => (props.mode === "play" ? undefined : props.onSelect(null))}
    >
      <Sky
        look={look}
        scale={scale}
        background={colors.background}
        ground={groundColor(description.geoms, colors.background)}
      />
      <Suns description={description} />
      {/* The grid is an editing aid: Play, replays and training show the world as it is. */}
      {props.mode === "play" ? null : (
        <Grid
          infiniteGrid
          cellColor={colors.grid}
          sectionColor={colors.gridStrong}
          fadeDistance={60 * scale}
          position={[0, 0.001, 0]}
        />
      )}
      {props.mode === "play" ? (
        <LiveGeoms geoms={description.geoms} poses={props.poses} track={track} onPick={props.onPick} />
      ) : (
        <EditGeoms {...props} />
      )}
      {props.rays && props.rays.length > 0 ? (
        <RayOverlay rays={props.rays} values={props.rayValues ?? false} track={props.mode === "play" ? track : null} />
      ) : null}
      <ZoneMarkers
        zones={description.zones ?? []}
        colors={{ goal: colors.goal, spawn: colors.spawn, area: colors.goal }}
      />
      {props.ghosts && props.ghosts.length > 0 ? <GhostGeoms geoms={props.ghosts} color={colors.proposal} /> : null}
      {view ? (
        <CameraRig
          description={description}
          mode={view.mode}
          frame={view.frame}
          track={props.mode === "play" ? track : null}
          include={follows}
          far={start.far}
        />
      ) : (
        <OrbitControls makeDefault />
      )}
      {props.mode === "play" || !viewCube ? null : (
        <GizmoHelper alignment="top-right" margin={[72, 72]}>
          <GizmoViewcube />
        </GizmoHelper>
      )}
    </Canvas>
  );
}
