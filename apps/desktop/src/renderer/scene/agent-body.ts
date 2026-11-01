import type { SceneBody, SceneDescription, SceneGeom } from "@icarus/contracts";
import { toThreePosition } from "./coordinates.ts";
import type { Pose } from "./pose-track.ts";
import { conjugate, multiply, type Quaternion, rotate } from "./quaternion.ts";
import { sceneBounds } from "./thumbnail-framing.ts";

// The geom whose pose places the agent, and what the cameras need to know about the body around it.
export type AgentAnchor = {
  body: string;
  geom: string;
  // Rotation from the geom's frame to its body's: the body's rotation is the geom's followed by this.
  toBody: Quaternion;
  // Distance from the geom's center to the front of the body, and the lift to sit above its center.
  front: number;
  lift: number;
  // Radius of everything the agent is made of.
  reach: number;
};

// Where the agent is and where it faces, in Three's axes; `yaw` turns about Three's y from +x.
export type AgentPose = { position: [number, number, number]; forward: [number, number, number]; yaw: number };

const solid = (geom: SceneGeom) => geom.shape !== "plane";

function subtree(bodies: readonly SceneBody[], root: string): Set<string> {
  const names = new Set([root]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const body of bodies) {
      if (body.parent && names.has(body.parent) && !names.has(body.name)) {
        names.add(body.name);
        grew = true;
      }
    }
  }
  return names;
}

// The agent is a top-level body with something solid (never the ground); one with parts attached wins over loose props.
export function agentBody(description: SceneDescription): SceneBody | null {
  const candidates = description.bodies.filter((body) => {
    if (body.parent !== null || body.name === "world") {
      return false;
    }
    const names = subtree(description.bodies, body.name);
    return description.geoms.some((geom) => solid(geom) && names.has(geom.body));
  });
  const articulated = candidates.find((body) => description.bodies.some((item) => item.parent === body.name));
  return articulated ?? candidates[0] ?? null;
}

// How far a box with these half sizes reaches along a unit direction of its own frame.
function extentAlong(geom: SceneGeom, direction: readonly [number, number, number]): number {
  if (geom.shape === "sphere") {
    return geom.size[0] / 2;
  }
  return direction.reduce((sum, value, axis) => sum + Math.abs(value) * ((geom.size[axis] ?? 0) / 2), 0);
}

// `include` narrows the geoms looked at, for a scene holding several copies of the agent.
export function agentAnchor(
  description: SceneDescription,
  include: (geom: SceneGeom) => boolean = () => true,
): AgentAnchor | null {
  const body = agentBody(description);
  if (!body) {
    return null;
  }
  const names = subtree(description.bodies, body.name);
  const parts = description.geoms.filter((geom) => solid(geom) && include(geom) && names.has(geom.body));
  const geom = parts.find((item) => item.body === body.name) ?? parts[0];
  if (!geom) {
    return null;
  }
  const toBody = multiply(conjugate(geom.quaternion), body.quaternion);
  return {
    body: body.name,
    geom: geom.name,
    toBody,
    front: extentAlong(geom, rotate(toBody, [1, 0, 0])),
    lift: extentAlong(geom, rotate(toBody, [0, 0, 1])) / 2,
    reach: sceneBounds(parts)?.radius ?? 0.5,
  };
}

// The agent's place and heading from its geom's pose (MuJoCo axes): the body faces its own x axis.
export function agentPose(anchor: AgentAnchor, geom: Pose): AgentPose {
  const [fx, fy, fz] = rotate(multiply(geom.quaternion, anchor.toBody), [1, 0, 0]);
  return {
    position: toThreePosition(geom.position),
    forward: toThreePosition([fx, fy, fz]),
    yaw: Math.atan2(fy, fx),
  };
}
