import { describe, expect, it } from "vitest";
import type { AgentPose } from "./agent-body.ts";
import { chaseCamera, dampAngle, onboardCamera } from "./camera-poses.ts";

const sub = (a: readonly number[], b: readonly number[]) => a.map((value, index) => value - (b[index] ?? 0));
const dot = (a: readonly number[], b: readonly number[]) =>
  a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);

// Three axes: facing -z (MuJoCo +y), standing at (4, 0.3, -1).
const agent: AgentPose = { position: [4, 0.3, -1], forward: [0, 0, -1], yaw: Math.PI / 2 };

describe("chase camera", () => {
  it("sits behind and above the agent and looks at it", () => {
    const camera = chaseCamera(agent, 1);
    const offset = sub(camera.position, agent.position);
    expect(dot(offset, agent.forward)).toBeLessThan(0);
    expect(offset[1]).toBeGreaterThan(0);
    expect(Math.abs(offset[0] ?? 1)).toBeLessThan(1e-9);
    expect(Math.hypot(...sub(camera.target, agent.position))).toBeLessThan(1);
  });

  it("follows the level heading, so a nose-down agent never pulls the camera under it", () => {
    const diving: AgentPose = { ...agent, forward: [0, -0.6, -0.8] };
    const offset = sub(chaseCamera(diving, 1).position, diving.position);
    expect(offset[1]).toBeGreaterThan(0);
    expect(offset[2]).toBeGreaterThan(0);
  });

  it("backs off further from a larger agent", () => {
    const near = Math.hypot(...sub(chaseCamera(agent, 0.5).position, agent.position));
    const far = Math.hypot(...sub(chaseCamera(agent, 3).position, agent.position));
    expect(far).toBeGreaterThan(near);
  });
});

describe("onboard camera", () => {
  it("rides at the front of the body and looks along its heading", () => {
    const camera = onboardCamera(agent, { front: 1, lift: 0.1 });
    const offset = sub(camera.position, agent.position);
    expect(dot(offset, agent.forward)).toBeGreaterThanOrEqual(1);
    expect(offset[1]).toBeCloseTo(0.1, 6);
    const look = sub(camera.target, camera.position);
    const length = Math.hypot(...look);
    expect(dot(look, agent.forward) / length).toBeCloseTo(1, 6);
  });
});

describe("heading smoothing", () => {
  it("turns the short way across the half turn", () => {
    const next = dampAngle(Math.PI - 0.1, -Math.PI + 0.1, 5, 0.1);
    // Moving from 179° toward -179° goes up through 180°, not back down through 0°.
    expect(Math.cos(next)).toBeLessThan(Math.cos(Math.PI - 0.1) + 1e-9);
    expect(Math.abs(Math.sin(next))).toBeLessThan(Math.sin(0.1));
  });

  it("gets closer each frame without overshooting", () => {
    const next = dampAngle(0, 1, 5, 0.016);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(1);
  });
});
