import type { SceneDescription, SceneGeom } from "@icarus/contracts";
import { Edges, GizmoHelper, GizmoViewcube, Grid, OrbitControls, TransformControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group } from "three";
import { fromThreePosition, toThreePosition, toThreeQuaternion } from "./coordinates.ts";
import { sceneColors } from "./scene-materials.ts";

export type SceneViewProps = {
  description: SceneDescription;
  selected: string | null;
  onSelect: (objectId: string | null) => void;
  // A drag of the selected object ended; the move is in MuJoCo world axes.
  onMove: (objectId: string, delta: [number, number, number]) => void;
};

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
        onSelect(geom.body);
      }}
    >
      <GeomShape geom={geom} />
      <meshStandardMaterial color={geom.color} roughness={0.8} />
      {selected ? <Edges color={colors.selected} /> : null}
    </mesh>
  );
}

// Draws the engine's compiled scene; it never moves anything itself, a drag only reports the move.
export default function SceneView({ description, selected, onSelect, onMove }: SceneViewProps) {
  const colors = useMemo(sceneColors, []);
  const dragged = useRef<Group>(null);
  const picked = description.geoms.filter((geom) => geom.body === selected);
  const body = description.bodies.find((item) => item.name === selected);
  const anchor = body ? toThreePosition(body.position) : null;
  const rest = description.geoms.filter((geom) => geom.body !== selected);
  return (
    <Canvas camera={{ position: [7, 6, 9], fov: 45 }} dpr={[1, 2]} onPointerMissed={() => onSelect(null)}>
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
        fadeDistance={60}
        position={[0, 0.001, 0]}
      />
      {rest.map((geom) => (
        <Geom key={geom.name} geom={geom} selected={false} onSelect={onSelect} />
      ))}
      {selected && anchor && picked.length > 0 ? (
        <TransformControls
          mode="translate"
          onMouseUp={() => {
            const group = dragged.current;
            if (!group) {
              return;
            }
            const delta = fromThreePosition([
              group.position.x - anchor[0],
              group.position.y - anchor[1],
              group.position.z - anchor[2],
            ]);
            group.position.set(anchor[0], anchor[1], anchor[2]);
            if (delta.some((value) => Math.abs(value) > 1e-6)) {
              onMove(selected, delta);
            }
          }}
        >
          <group ref={dragged} position={anchor}>
            {picked.map((geom) => (
              <Geom key={geom.name} geom={geom} selected onSelect={onSelect} origin={anchor} />
            ))}
          </group>
        </TransformControls>
      ) : null}
      <OrbitControls makeDefault />
      <GizmoHelper alignment="top-right" margin={[72, 72]}>
        <GizmoViewcube />
      </GizmoHelper>
    </Canvas>
  );
}
