import type { SceneRay } from "@icarus/contracts";
import { tokens } from "@icarus/ui-tokens";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, Color } from "three";
import { toThreePosition } from "./coordinates.ts";
import type { PosePlayer } from "./motion-player.ts";
import { type PoseTrack, trackProgress } from "./pose-track.ts";
import { easeRays, type RayLine, rayLine } from "./ray-lines.ts";

// Readings are written next to the hits only while there are few enough to read.
const MAX_VALUES = 24;
const DOT_SIZE = 0.14;

const RAY = new Color(tokens.scene.sensorRay.color);
const HIT = new Color(tokens.scene.sensorHit);

function buffer(count: number): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(count * 3), 3));
  return geometry;
}

function write(geometry: BufferGeometry, index: number, point: readonly [number, number, number], color: Color) {
  const [x, y, z] = toThreePosition(point);
  geometry.getAttribute("position").setXYZ(index, x, y, z);
  geometry.getAttribute("color").setXYZ(index, color.r, color.g, color.b);
}

function draw(lines: readonly RayLine[], segments: BufferGeometry, dots: BufferGeometry) {
  let hits = 0;
  lines.forEach((line, index) => {
    const color = line.near ? HIT : RAY;
    write(segments, index * 2, line.from, color);
    write(segments, index * 2 + 1, line.to, color);
    if (line.hit) {
      write(dots, hits, line.to, color);
      hits += 1;
    }
  });
  segments.setDrawRange(0, lines.length * 2);
  dots.setDrawRange(0, hits);
  for (const geometry of [segments, dots]) {
    geometry.getAttribute("position").needsUpdate = true;
    geometry.getAttribute("color").needsUpdate = true;
  }
}

// The engine's distance sensors as thin lines from each sensor to what it hit (with a dot) or to its full range,
// hot when the hit is close. In a live view `track` eases them with the geoms, or `player` plays their recorded
// readings; it never moves a ray by itself.
export function RayOverlay({
  rays,
  values,
  track,
  player,
  layer,
}: {
  rays: readonly SceneRay[];
  values: boolean;
  track: RefObject<PoseTrack | null> | null;
  player?: PosePlayer;
  // A fixed element over the canvas: drei moves labels between hosts when its default host changes, and React then
  // fails to remove them.
  layer: RefObject<HTMLDivElement | null>;
}) {
  const frames = useRef({ from: rays, to: rays });
  useEffect(() => {
    frames.current = { from: frames.current.to, to: rays };
  }, [rays]);
  const count = rays.length;
  const segments = useMemo(() => buffer(count * 2), [count]);
  const dots = useMemo(() => buffer(count), [count]);
  useEffect(
    () => () => {
      segments.dispose();
      dots.dispose();
    },
    [segments, dots],
  );
  useFrame(() => {
    if (player) {
      draw(player.at(performance.now()).rays.slice(0, count).map(rayLine), segments, dots);
      return;
    }
    const current = track?.current;
    const t = current ? trackProgress(current, performance.now()) : 1;
    draw(easeRays(frames.current.from, frames.current.to, t).map(rayLine), segments, dots);
  });
  // SAFETY: drei reads `portal.current` with optional chaining, so an element not attached yet is handled.
  const host = layer as RefObject<HTMLElement>;
  // Readings change with each snapshot, which renders this again; a player's labels follow what it plays then.
  const labelled = player ? player.at(performance.now()).rays : rays;
  const labels = values && count <= MAX_VALUES ? labelled.map(rayLine).filter((line) => line.value !== null) : [];
  return (
    <>
      <lineSegments geometry={segments} frustumCulled={false} raycast={() => undefined} renderOrder={2}>
        <lineBasicMaterial vertexColors transparent opacity={tokens.scene.sensorRay.opacity} depthWrite={false} />
      </lineSegments>
      <points geometry={dots} frustumCulled={false} raycast={() => undefined} renderOrder={2}>
        <pointsMaterial vertexColors size={DOT_SIZE} sizeAttenuation depthWrite={false} />
      </points>
      {labels.map((line) => (
        <Html key={line.sensor} portal={host} position={toThreePosition(line.to)} center zIndexRange={[1, 0]}>
          <span className="pointer-events-none select-none whitespace-nowrap rounded-full bg-overlay px-1.5 py-0.5 font-mono text-meta">
            {line.value}
          </span>
        </Html>
      ))}
    </>
  );
}
