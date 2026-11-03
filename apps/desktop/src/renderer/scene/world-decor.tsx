import type { SceneDescription, SceneDisplay, SceneEyes, ScenePlate } from "@icarus/contracts";
import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import { CanvasTexture, type Group, type MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from "three";
import { toThreePosition, toThreeQuaternion, type Vector3 } from "./coordinates.ts";
import {
  anchorPose,
  blinkAmount,
  displayPoint,
  easedGlow,
  eyeCenters,
  eyeSeed,
  headingTurn,
  PANEL,
  plateLook,
  pupilShift,
} from "./decor-look.ts";
import { barFill, displayText } from "./display-text.ts";
import { type PoseTrack, poseAt } from "./pose-track.ts";
import { conjugate, multiply, rotate } from "./quaternion.ts";
import { copyOf, displayValue, ownName, plateSignal, type SignalFeed } from "./scene-signals.ts";

type Track = RefObject<PoseTrack | null> | null;
type Shared = { feed?: SignalFeed; copies: number };

const PLATE_GLOW = 1.2;
const STRIPE_CELL = 0.5;
// Height of a display panel for each metre of its width, and the canvas it is drawn on.
const PANEL_ASPECT = 0.3;
const CANVAS_WIDTH = 512;
const FLAT: [number, number, number] = [0, Math.PI / 2, 0];

const noRaycast = () => undefined;

function placeGroup(group: Group, position: Vector3, quaternion: readonly [number, number, number, number]) {
  const [x, y, z] = toThreePosition(position);
  group.position.set(x, y, z);
  group.quaternion.set(...toThreeQuaternion(quaternion));
}

function stripeTexture(color: string, size: Vector3): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = PANEL.stripe;
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = color;
    for (const start of [-64, 0, 64]) {
      context.beginPath();
      context.moveTo(start, 64);
      context.lineTo(start + 32, 64);
      context.lineTo(start + 96, 0);
      context.lineTo(start + 64, 0);
      context.fill();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(Math.max(1, size[0] / STRIPE_CELL), Math.max(1, size[1] / STRIPE_CELL));
  return texture;
}

// A floor plate: it glows and sinks only while the engine reports its trigger holding.
function PlateMesh({ plate, feed, copies }: { plate: ScenePlate } & Shared) {
  const group = useRef<Group>(null);
  const material = useRef<MeshStandardMaterial>(null);
  const [width, depth, thickness] = plate.size;
  const striped = plateLook(plate, undefined).stripes;
  const texture = useMemo(() => (striped ? stripeTexture(plate.color, plate.size) : null), [striped, plate]);
  useEffect(() => () => texture?.dispose(), [texture]);
  const copy = copyOf(plate.name, copies);
  const glow = useRef(0);
  useFrame((_, delta) => {
    const signals = feed?.(performance.now())[copy];
    const look = plateLook(plate, plateSignal(signals, ownName(plate.object)));
    const [, y] = toThreePosition(plate.position);
    group.current?.position.setY(y - look.sink);
    glow.current = easedGlow(glow.current, look.glow, delta);
    if (material.current) {
      material.current.emissiveIntensity = glow.current * PLATE_GLOW;
    }
  });
  return (
    <group
      ref={group}
      position={toThreePosition(plate.position)}
      quaternion={toThreeQuaternion(plate.quaternion)}
      raycast={noRaycast}
    >
      <mesh receiveShadow raycast={noRaycast}>
        {plate.shape === "cylinder" ? (
          <cylinderGeometry args={[width / 2, width / 2, thickness, 48]} />
        ) : (
          <boxGeometry args={[width, thickness, depth]} />
        )}
        <meshStandardMaterial
          ref={material}
          color={texture ? PANEL.white : plate.color}
          map={texture}
          emissive={plate.color}
          emissiveIntensity={0}
          roughness={0.6}
        />
      </mesh>
    </group>
  );
}

function drawPanel(canvas: HTMLCanvasElement, display: SceneDisplay, text: string, fill: number) {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const { width, height } = canvas;
  context.fillStyle = PANEL.face;
  context.fillRect(0, 0, width, height);
  context.shadowColor = display.color ?? PANEL.digits;
  context.fillStyle = display.color ?? PANEL.digits;
  if (display.style === "bar") {
    const pad = height * 0.18;
    context.fillStyle = PANEL.track;
    context.fillRect(pad, pad, width - pad * 2, height - pad * 2);
    context.fillStyle = display.color ?? PANEL.digits;
    context.fillRect(pad, pad, (width - pad * 2) * fill, height - pad * 2);
    return;
  }
  context.shadowBlur = height * 0.12;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const size = Math.min(height * 0.72, (width * 1.6) / Math.max(4, text.length));
  context.font = `bold ${Math.round(size)}px "Consolas", "Menlo", monospace`;
  context.fillText(text, width / 2, height / 2);
  context.shadowBlur = 0;
}

// A digital panel on a part showing the value the engine reported for this frame, or "--" while it has none.
function DisplayPanel({ display, feed, copies, track }: { display: SceneDisplay; track: Track } & Shared) {
  const group = useRef<Group>(null);
  const shown = useRef<string | null>(null);
  const width = display.width ?? 1;
  const height = width * PANEL_ASPECT;
  const { canvas, texture } = useMemo(() => {
    const element = document.createElement("canvas");
    element.width = CANVAS_WIDTH;
    element.height = Math.round(CANVAS_WIDTH * PANEL_ASPECT);
    const made = new CanvasTexture(element);
    made.colorSpace = SRGBColorSpace;
    return { canvas: element, texture: made };
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  const copy = copyOf(display.anchor.object, copies);
  const object = ownName(display.anchor.object);
  useFrame(() => {
    const now = performance.now();
    const geom = display.anchor.geom;
    const live = track?.current && geom ? poseAt(track.current, geom, now) : null;
    const pose = anchorPose(display.anchor, live);
    if (group.current) {
      const turned = multiply(pose.quaternion, headingTurn(display.heading ?? 0));
      placeGroup(group.current, displayPoint(pose, display.offset ?? [0, 0, 0], display.billboard ?? false), turned);
    }
    const value = displayValue(feed?.(now)[copy], object);
    const text = displayText(display, value);
    const key = `${text}|${barFill(value, display.full_scale ?? 1).toFixed(3)}`;
    if (key !== shown.current) {
      shown.current = key;
      drawPanel(canvas, display, text, barFill(value, display.full_scale ?? 1));
      texture.needsUpdate = true;
    }
  });
  const face = (
    <mesh raycast={noRaycast} rotation={display.billboard ? [0, 0, 0] : FLAT}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
  return (
    <group ref={group} raycast={noRaycast}>
      {display.billboard ? <Billboard>{face}</Billboard> : face}
    </group>
  );
}

type EyeProps = { eyes: SceneEyes; track: Track; goal: Vector3 | null };

// Two cartoon eyes that blink on their own and may look along the way the part moves or toward the goal.
function EyesPair({ eyes, track, goal }: EyeProps) {
  const group = useRef<Group>(null);
  const lids = useRef<(Group | null)[]>([]);
  const pupils = useRef<(Group | null)[]>([]);
  const last = useRef<{ position: Vector3; heading: Vector3 } | null>(null);
  const seed = useMemo(() => eyeSeed(eyes.anchor.object), [eyes.anchor.object]);
  const centers = eyeCenters(eyes);
  const radius = eyes.size / 2;
  useFrame(() => {
    const now = performance.now();
    const geom = eyes.anchor.geom;
    const pose = anchorPose(eyes.anchor, track?.current && geom ? poseAt(track.current, geom, now) : null);
    const turned = multiply(pose.quaternion, headingTurn(eyes.facing ?? 0));
    if (group.current) {
      placeGroup(group.current, pose.position, turned);
    }
    const blink = blinkAmount(now / 1000, eyes.blink_interval ?? 3, eyes.blink_jitter ?? 0.5, seed);
    for (const lid of lids.current) {
      lid?.scale.set(1, 1 - 0.92 * blink, 1);
    }
    const previous = last.current;
    const moved: Vector3 = previous
      ? [pose.position[0] - previous.position[0], pose.position[1] - previous.position[1], 0]
      : [0, 0, 0];
    const heading: Vector3 = Math.hypot(moved[0], moved[1]) > 1e-4 ? moved : (previous?.heading ?? [0, 0, 0]);
    last.current = { position: pose.position, heading };
    const target: Vector3 =
      eyes.look === "goal" && goal
        ? [goal[0] - pose.position[0], goal[1] - pose.position[1], goal[2] - pose.position[2]]
        : eyes.look === "movement"
          ? heading
          : [0, 0, 0];
    const [left, up] = pupilShift(rotate(conjugate(turned), target));
    for (const pupil of pupils.current) {
      // The turned part's left (+y) is Three's −z inside the group.
      pupil?.position.set(radius * 0.2, up * radius * 0.4, -left * radius * 0.4);
    }
  });
  return (
    <group ref={group} raycast={noRaycast}>
      {centers.map(([x, y, z], index) => (
        <group
          // biome-ignore lint/suspicious/noArrayIndexKey: always two eyes, right then left.
          key={index}
          position={[x, z, -y]}
          ref={(lid: Group | null) => {
            lids.current[index] = lid;
          }}
        >
          <mesh scale={[0.45, 1, 1]} raycast={noRaycast}>
            <sphereGeometry args={[radius, 24, 16]} />
            <meshBasicMaterial color={eyes.white ?? PANEL.white} />
          </mesh>
          <group
            ref={(pupil: Group | null) => {
              pupils.current[index] = pupil;
            }}
          >
            <mesh scale={[0.4, 1, 1]} raycast={noRaycast}>
              <sphereGeometry args={[radius * 0.48, 16, 12]} />
              <meshBasicMaterial color={eyes.color ?? PANEL.pupil} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

// Floor plates, digital displays and eyes over the scene. `feed` gives the plate states and display values the
// engine measured, per copy; `track` the eased engine poses the displays and eyes ride on. Without a feed the
// plates rest and displays show "--" (or their fixed text).
export function WorldDecor({
  description,
  feed,
  copies = 1,
  track = null,
}: {
  description: SceneDescription;
  feed?: SignalFeed;
  copies?: number;
  track?: Track;
}) {
  const goals = (description.zones ?? []).filter((zone) => zone.kind === "goal_zone");
  return (
    <>
      {(description.plates ?? []).map((plate) => (
        <PlateMesh key={plate.name} plate={plate} feed={feed} copies={copies} />
      ))}
      {(description.displays ?? []).map((display) => (
        <DisplayPanel key={display.anchor.object} display={display} feed={feed} copies={copies} track={track} />
      ))}
      {(description.eyes ?? []).map((eyes) => {
        const copy = copyOf(eyes.anchor.object, copies);
        const goal = goals.find((zone) => copyOf(zone.name, copies) === copy) ?? goals[0];
        return <EyesPair key={eyes.anchor.object} eyes={eyes} track={track} goal={goal ? goal.position : null} />;
      })}
    </>
  );
}
