import type { SceneDescription, SceneGeom, SceneRay } from "@icarus/contracts";
import { Edges, GizmoHelper, GizmoViewcube, Grid, OrbitControls, TransformControls } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { type KeyboardEvent, type RefObject, useContext, useMemo, useRef, useState } from "react";
import { type Group, Quaternion } from "three";
import { type CameraView, CameraViewContext } from "./camera-mode.ts";
import { CameraRig, VIEW_FOV } from "./camera-rig.tsx";
import { fromThreePosition, fromThreeQuaternion, toThreePosition, toThreeQuaternion } from "./coordinates.ts";
import { GeomShape } from "./geom-geometry.tsx";
import { geomGeometry, geomObject } from "./geom-object.ts";
import { type GizmoMode, gizmoForKey } from "./gizmo-mode.ts";
import { imageGrade } from "./image-grade.ts";
import { LiveGeoms, type ScenePick } from "./live-geoms.tsx";
import { isDeliberateClick } from "./pick.ts";
import type { Poses, PoseTrack } from "./pose-track.ts";
import { RayOverlay } from "./ray-overlay.tsx";
import { groundColor } from "./scene-lighting.ts";
import { PROPOSAL_OPACITY, sceneColors } from "./scene-materials.ts";
import { skyLook } from "./scene-sky.ts";
import { Sky, Suns } from "./world-lighting.tsx";
import { ZoneMarkers } from "./zone-markers.tsx";

export type { ScenePick } from "./live-geoms.tsx";

type Vec3 = [number, number, number];

type EditProps = {
  mode?: "edit";
  selected: string | null;
  onSelect: (objectId: string | null) => void;
  // What a drag of the selected object does; W, E and R in the view ask for another mode through `onGizmo`.
  gizmo?: GizmoMode;
  onGizmo?: (mode: GizmoMode) => void;
  // A drag of the selected object ended; the move is in MuJoCo world axes.
  onMove: (objectId: string, delta: Vec3) => void;
  // A turn ended: the rotation in MuJoCo world axes, quaternion wxyz.
  onRotate?: (objectId: string, delta: [number, number, number, number]) => void;
  // A stretch ended: the factor along each of the object's own axes, MuJoCo order.
  onScale?: (objectId: string, factor: Vec3) => void;
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

const CONTROL_MODES = { move: "translate", rotate: "rotate", scale: "scale" } as const;
const CHANGED = 1e-6;

type Picked = { id: string; anchor: Vec3; turn: [number, number, number, number] };

// Reads what the drag did to the group, puts the group back where the engine has it and reports the change;
// the engine's answer moves the object for real.
function reportDrag(group: Group, picked: Picked, gizmo: GizmoMode, props: EditProps) {
  const { id, anchor, turn } = picked;
  if (gizmo === "move") {
    const delta = fromThreePosition([
      group.position.x - anchor[0],
      group.position.y - anchor[1],
      group.position.z - anchor[2],
    ]);
    group.position.set(...anchor);
    if (delta.some((value) => Math.abs(value) > CHANGED)) {
      props.onMove(id, delta);
    }
    return;
  }
  if (gizmo === "rotate") {
    const delta = group.quaternion.clone().multiply(new Quaternion(...turn).invert());
    group.quaternion.set(...turn);
    if (1 - Math.abs(delta.w) > CHANGED) {
      props.onRotate?.(id, fromThreeQuaternion([delta.x, delta.y, delta.z, delta.w]));
    }
    return;
  }
  const factor = fromThreePosition([group.scale.x, group.scale.y, group.scale.z]).map(Math.abs);
  group.scale.set(1, 1, 1);
  const [x = 1, y = 1, z = 1] = factor;
  // A drag that starts on the gizmo's very centre has no length to compare with and gives no finite factor.
  if (factor.every(Number.isFinite) && factor.some((value) => Math.abs(value - 1) > CHANGED)) {
    props.onScale?.(id, [x, y, z]);
  }
}

function EditGeoms(props: { description: SceneDescription } & EditProps) {
  const { description, selected, onSelect, gizmo = "move" } = props;
  const [dragged, setDragged] = useState<Group | null>(null);
  const picked = description.geoms.filter((geom) => geom.body === selected);
  const body = description.bodies.find((item) => item.name === selected);
  const rest = description.geoms.filter((geom) => geom.body !== selected);
  const target: Picked | null =
    selected && body
      ? { id: selected, anchor: toThreePosition(body.position), turn: toThreeQuaternion(body.quaternion) }
      : null;
  return (
    <>
      {rest.map((geom) => (
        <Geom key={geom.name} geom={geom} selected={false} onSelect={onSelect} />
      ))}
      {target && picked.length > 0 ? (
        <>
          {/* Turned like the object, so rotate and scale work along its own axes; the inner group undoes the turn. */}
          <group ref={setDragged} position={target.anchor} quaternion={target.turn}>
            <group quaternion={new Quaternion(...target.turn).invert()}>
              {picked.map((geom) => (
                <Geom key={geom.name} geom={geom} selected onSelect={onSelect} origin={target.anchor} />
              ))}
            </group>
          </group>
          {/* Attached to the group above (not a wrapper of its own), so the drag moves what is read on release. */}
          <TransformControls
            object={dragged ?? undefined}
            mode={CONTROL_MODES[gizmo]}
            space={gizmo === "move" ? "world" : "local"}
            onMouseUp={() => {
              if (dragged) {
                reportDrag(dragged, target, gizmo, props);
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
          <meshStandardMaterial
            color={color}
            transparent
            opacity={PROPOSAL_OPACITY}
            depthWrite={false}
            envMapIntensity={0}
          />
          <Edges color={color} />
        </mesh>
      ))}
    </>
  );
}

function viewLabel(editing: boolean): string {
  return editing
    ? "3D view, press F to frame everything, W to move, E to rotate and R to scale"
    : "3D view, press F to frame everything";
}

function viewKeys(view: CameraView | null, onGizmo: ((mode: GizmoMode) => void) | undefined) {
  return (event: KeyboardEvent<HTMLDivElement>) => {
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
    if (view && (event.key === "f" || event.key === "F") && plain) {
      event.preventDefault();
      view.onFrameAll();
      return;
    }
    const gizmo = onGizmo
      ? gizmoForKey({ key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey })
      : null;
    if (gizmo) {
      event.preventDefault();
      onGizmo?.(gizmo);
    }
  };
}

// Draws the engine's compiled scene; it never moves anything itself, a drag or a pick only reports what was done.
// The sky's color grade applies to the finished picture: a filter over the canvas and a multiplied tint.
export default function SceneView(props: SceneViewProps) {
  const grade = useMemo(() => imageGrade(props.description.sky), [props.description.sky]);
  const labels = useRef<HTMLDivElement>(null);
  return (
    <div className="relative h-full w-full">
      <div className="relative h-full w-full" style={{ filter: grade.filter }}>
        <SceneCanvas {...props} exposure={grade.exposure} labels={labels} />
        {grade.tint ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 mix-blend-multiply"
            style={{ backgroundColor: grade.tint }}
          />
        ) : null}
      </div>
      {/* Labels drawn over the 3D view live outside the canvas, so they stay put when the canvas re-renders. */}
      <div ref={labels} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
}

function SceneCanvas(props: SceneViewProps & { exposure: number; labels: RefObject<HTMLDivElement | null> }) {
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
      aria-label={view ? viewLabel(props.mode !== "play" && props.onGizmo !== undefined) : undefined}
      onKeyDown={viewKeys(view, props.mode === "play" ? undefined : props.onGizmo)}
      onPointerMissed={() => (props.mode === "play" ? undefined : props.onSelect(null))}
    >
      <Sky
        description={description}
        look={look}
        scale={scale}
        background={colors.background}
        ground={groundColor(description.geoms, colors.background)}
        exposure={props.exposure}
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
        <RayOverlay
          rays={props.rays}
          values={props.rayValues ?? false}
          track={props.mode === "play" ? track : null}
          layer={props.labels}
        />
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
