import type { AgentAnchor, AgentPose } from "./agent-body.ts";

// A camera's place and what it looks at, in Three's axes.
export type CameraPose = { position: [number, number, number]; target: [number, number, number] };

const LOOK_AHEAD = 10;

// Behind and above the agent along its level heading, so pitching or rolling never swings the camera under it.
export function chaseCamera(agent: AgentPose, reach: number): CameraPose {
  const back = Math.max(2.5, reach * 4);
  const up = Math.max(1.2, reach * 2);
  const [x, y, z] = agent.position;
  const dx = Math.cos(agent.yaw);
  const dz = -Math.sin(agent.yaw);
  return {
    position: [x - dx * back, y + up, z - dz * back],
    target: [x, y + reach * 0.3, z],
  };
}

// First person: at the front of the body, a little above its center, looking where it faces.
export function onboardCamera(agent: AgentPose, anchor: Pick<AgentAnchor, "front" | "lift">): CameraPose {
  const [x, y, z] = agent.position;
  const [fx, fy, fz] = agent.forward;
  const ahead = anchor.front + 0.05;
  const position: [number, number, number] = [x + fx * ahead, y + fy * ahead + anchor.lift, z + fz * ahead];
  return {
    position,
    target: [position[0] + fx * LOOK_AHEAD, position[1] + fy * LOOK_AHEAD, position[2] + fz * LOOK_AHEAD],
  };
}

// Frame-rate independent easing toward a target; `rate` is how quickly, per second.
export function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

// Like `damp`, but turning the short way round.
export function dampAngle(current: number, target: number, rate: number, dt: number): number {
  const turn = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + turn * (1 - Math.exp(-rate * dt));
}
