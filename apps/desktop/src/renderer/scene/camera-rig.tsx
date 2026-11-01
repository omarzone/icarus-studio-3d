import type { SceneDescription, SceneGeom } from "@icarus/contracts";
import { OrbitControls } from "@react-three/drei";
import { type Camera, useFrame, useThree } from "@react-three/fiber";
import { type ComponentRef, type RefObject, useLayoutEffect, useMemo, useRef } from "react";
import { type AgentAnchor, type AgentPose, agentAnchor, agentPose } from "./agent-body.ts";
import type { CameraMode } from "./camera-mode.ts";
import { type CameraPose, chaseCamera, damp, dampAngle, onboardCamera } from "./camera-poses.ts";
import { type PoseTrack, poseAt } from "./pose-track.ts";
import { sceneBounds, thumbnailCamera, topCamera } from "./thumbnail-framing.ts";

export const VIEW_FOV = 45;
// How quickly the chase camera catches up with the agent's place and heading, per second.
const FOLLOW_RATE = 4;

type Controls = ComponentRef<typeof OrbitControls>;
type Vec3 = [number, number, number];

type Props = {
  description: SceneDescription;
  mode: CameraMode;
  frame: number;
  // Eased engine poses in Play views; edit views place the agent where the description has it.
  track: RefObject<PoseTrack | null> | null;
  // Geoms the agent is looked for in (the first copy of a training grid).
  include?: (geom: SceneGeom) => boolean;
  far: number;
};

function place(camera: Camera, controls: Controls, pose: CameraPose, far: number) {
  camera.position.set(...pose.position);
  controls.target.set(...pose.target);
  camera.far = far;
  camera.updateProjectionMatrix();
  controls.update();
}

function currentAgent(
  anchor: AgentAnchor | null,
  description: SceneDescription,
  track: PoseTrack | null,
): AgentPose | null {
  if (!anchor) {
    return null;
  }
  const live = track ? poseAt(track, anchor.geom, performance.now()) : null;
  const still = description.geoms.find((geom) => geom.name === anchor.geom);
  const pose = live ?? still;
  return pose ? agentPose(anchor, pose) : null;
}

// Moves the camera for the chosen mode; it only reads where the engine put things, never moves them.
export function CameraRig({ description, mode, frame, track, include, far }: Props) {
  const controls = useRef<Controls>(null);
  const get = useThree((state) => state.get);
  const anchor = useMemo(() => agentAnchor(description, include), [description, include]);
  const latest = useRef({ description, anchor });
  latest.current = { description, anchor };
  // The smoothed place and heading the chase camera is following.
  const chase = useRef<{ position: Vec3; yaw: number } | null>(null);

  const agentNow = () => currentAgent(latest.current.anchor, latest.current.description, track?.current ?? null);

  // Framing happens when the view opens, the mode changes or Frame all is asked; edits to the scene never move it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `frame` is the request to frame again; the scene is read from `latest`.
  useLayoutEffect(() => {
    const orbit = controls.current;
    if (!orbit) {
      return;
    }
    const { camera, size } = get();
    const aspect = size.width / Math.max(size.height, 1);
    const { description: scene, anchor: agentAnchorNow } = latest.current;
    const bounds = sceneBounds(scene.geoms, scene.zones ?? []);
    const agent = agentNow();
    chase.current = null;
    if (mode === "top") {
      const pose = topCamera(bounds, aspect, VIEW_FOV);
      place(camera, orbit, pose, Math.max(far, pose.far));
      return;
    }
    if (mode !== "free" && agent && agentAnchorNow) {
      chase.current = { position: agent.position, yaw: agent.yaw };
      const pose = mode === "follow" ? chaseCamera(agent, agentAnchorNow.reach) : onboardCamera(agent, agentAnchorNow);
      place(camera, orbit, pose, far);
      return;
    }
    const pose = thumbnailCamera(bounds, aspect, VIEW_FOV);
    place(camera, orbit, pose, Math.max(far, pose.far));
  }, [mode, frame, get, far]);

  useFrame(({ camera }, delta) => {
    const orbit = controls.current;
    const followed = chase.current;
    const anchorNow = latest.current.anchor;
    if (!orbit || !followed || !anchorNow || (mode !== "follow" && mode !== "onboard")) {
      return;
    }
    const agent = agentNow();
    if (!agent) {
      return;
    }
    if (mode === "onboard") {
      const pose = onboardCamera(agent, anchorNow);
      camera.position.set(...pose.position);
      orbit.target.set(...pose.target);
      camera.lookAt(...pose.target);
      return;
    }
    const dt = Math.min(delta, 0.1);
    const [px, py, pz] = followed.position;
    const next: Vec3 = [
      damp(px, agent.position[0], FOLLOW_RATE, dt),
      damp(py, agent.position[1], FOLLOW_RATE, dt),
      damp(pz, agent.position[2], FOLLOW_RATE, dt),
    ];
    const yaw = dampAngle(followed.yaw, agent.yaw, FOLLOW_RATE, dt);
    // Keep whatever orbit the user chose around the agent, turned with its heading.
    const turn = yaw - followed.yaw;
    const ox = camera.position.x - orbit.target.x;
    const oy = camera.position.y - orbit.target.y;
    const oz = camera.position.z - orbit.target.z;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const lift = orbit.target.y - py;
    orbit.target.set(next[0], next[1] + lift, next[2]);
    camera.position.set(next[0] + ox * cos + oz * sin, next[1] + lift + oy, next[2] - ox * sin + oz * cos);
    chase.current = { position: next, yaw };
    orbit.update();
  });

  return <OrbitControls ref={controls} makeDefault enabled={mode !== "onboard"} />;
}
