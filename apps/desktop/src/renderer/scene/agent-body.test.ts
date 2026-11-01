import type { SceneBody, SceneDescription, SceneGeom } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { agentAnchor, agentBody, agentPose } from "./agent-body.ts";

type Quat = [number, number, number, number];
const IDENTITY: Quat = [1, 0, 0, 0];
// A quarter turn about MuJoCo z: the body's x (forward) points along world +y.
const LEFT: Quat = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];

const body = (name: string, parent: string | null, quaternion: Quat = IDENTITY): SceneBody => ({
  name,
  parent,
  position: [0, 0, 0],
  quaternion,
});

const geom = (
  name: string,
  owner: string,
  shape: SceneGeom["shape"],
  position: [number, number, number],
  size: [number, number, number],
  quaternion: Quat = IDENTITY,
): SceneGeom => ({ name, body: owner, shape, position, size, quaternion, color: "#808080" });

const scene = (bodies: SceneBody[], geoms: SceneGeom[]): SceneDescription => ({
  revision: 1,
  bodies,
  geoms,
  lights: [],
});

const floor = geom("floor", "ground", "plane", [0, 0, 0], [40, 40, 0]);

describe("agent body", () => {
  it("skips the ground and picks the first top-level body with something solid", () => {
    const description = scene(
      [body("ground", null), body("car", null), body("wheel", "car")],
      [
        floor,
        geom("chassis", "car", "box", [0, 0, 0.3], [2, 1, 0.4]),
        geom("tyre", "wheel", "cylinder", [0.8, 0.5, 0.2], [0.4, 0.4, 0.2]),
      ],
    );
    expect(agentBody(description)?.name).toBe("car");
  });

  it("prefers a top-level body with parts attached over loose props listed before it", () => {
    const description = scene(
      [body("crate", null), body("robot", null), body("leg", "robot")],
      [
        geom("crate-box", "crate", "box", [3, 0, 0.5], [1, 1, 1]),
        geom("torso", "robot", "box", [0, 0, 0.5], [0.5, 0.5, 0.5]),
        geom("thigh", "leg", "capsule", [0, 0, 0.2], [0.1, 0.1, 0.4]),
      ],
    );
    expect(agentBody(description)?.name).toBe("robot");
  });

  it("falls back to the first solid top-level body when nothing is articulated", () => {
    const description = scene([body("ball", null)], [geom("ball-shape", "ball", "sphere", [0, 0, 0.5], [1, 1, 1])]);
    expect(agentBody(description)?.name).toBe("ball");
  });

  it("has no agent in a world that is only ground", () => {
    expect(agentBody(scene([body("ground", null)], [floor]))).toBeNull();
    expect(agentAnchor(scene([body("ground", null)], [floor]))).toBeNull();
  });
});

describe("agent anchor and pose", () => {
  const car = scene(
    [body("car", null), body("wheel", "car")],
    [
      geom("tyre", "wheel", "cylinder", [0.8, 0.5, 0.2], [0.4, 0.4, 0.2]),
      geom("chassis", "car", "box", [0, 0, 0.3], [2, 1, 0.4]),
    ],
  );

  it("follows the root body's own geom, never a wheel that spins", () => {
    expect(agentAnchor(car)?.geom).toBe("chassis");
  });

  it("knows how far the front of the body is from its center along the heading", () => {
    expect(agentAnchor(car)?.front).toBeCloseTo(1, 6);
  });

  it("reads the heading from the body's rotation: MuJoCo x-forward turned a quarter is Three -z", () => {
    const anchor = agentAnchor(car);
    expect(anchor).not.toBeNull();
    if (!anchor) {
      return;
    }
    const pose = agentPose(anchor, { position: [5, 2, 0.3], quaternion: LEFT });
    expect(pose.position).toEqual([5, 0.3, -2]);
    expect(pose.forward[0]).toBeCloseTo(0, 6);
    expect(pose.forward[1]).toBeCloseTo(0, 6);
    expect(pose.forward[2]).toBeCloseTo(-1, 6);
    expect(pose.yaw).toBeCloseTo(Math.PI / 2, 6);
  });

  it("keeps the body's heading when its geom is rotated inside it", () => {
    // The body faces +x but its only geom is drawn turned a quarter; the heading must still be the body's.
    const turned = scene([body("bot", null)], [geom("shell", "bot", "box", [0, 0, 0.3], [1, 2, 0.4], LEFT)]);
    const anchor = agentAnchor(turned);
    expect(anchor).not.toBeNull();
    if (!anchor) {
      return;
    }
    expect(anchor.front).toBeCloseTo(1, 6);
    const pose = agentPose(anchor, { position: [0, 0, 0.3], quaternion: LEFT });
    expect(pose.forward[0]).toBeCloseTo(1, 6);
    expect(pose.yaw).toBeCloseTo(0, 6);
  });

  it("only looks at the geoms it is told to (the first copy of a training grid)", () => {
    const grid = scene(
      [body("car", null)],
      [
        geom("0:chassis", "car", "box", [-3, 0, 0.3], [2, 1, 0.4]),
        geom("1:chassis", "car", "box", [3, 0, 0.3], [2, 1, 0.4]),
      ],
    );
    expect(agentAnchor(grid, (item) => item.name.startsWith("1:"))?.geom).toBe("1:chassis");
  });
});
