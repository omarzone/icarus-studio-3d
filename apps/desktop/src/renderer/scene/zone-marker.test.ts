import type { SceneZone } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { ZONE_OPACITY } from "./scene-materials.ts";
import { zoneMarker } from "./zone-marker.ts";
import { zoneMesh } from "./zone-mesh.ts";

const zone = (over: Partial<SceneZone>): SceneZone => ({
  name: "goal:goal_zone",
  object: "goal",
  kind: "goal_zone",
  shape: "sphere",
  size: [3, 3, 3],
  position: [12, -2, 0.5],
  quaternion: [1, 0, 0, 0],
  ...over,
});

describe("zoneMarker", () => {
  it("draws a goal as a flat disc on the ground under its centre, as wide as the zone", () => {
    expect(zoneMarker(zone({}))).toEqual({ kind: "disc", tone: "goal", position: [12, 0.01, 2], radius: 1.5 });
  });

  it("draws the spawn point as a small ring on the ground", () => {
    const marker = zoneMarker(zone({ kind: "spawn_point", size: [0.2, 0.2, 0.2], position: [0, 0, 0.3] }));
    expect(marker).toEqual({ kind: "ring", tone: "spawn", position: [0, 0.01, -0], radius: 0.5 });
  });

  it("draws a marked area as a box where it is", () => {
    const marker = zoneMarker(zone({ kind: "zone", shape: "box", size: [2, 4, 1], position: [1, 2, 0.5] }));
    expect(marker).toEqual({ kind: "box", tone: "area", position: [1, 0.5, -2], size: [2, 1, 4] });
  });
});

describe("zoneMesh", () => {
  const colors = { goal: "#00ff00", spawn: "#ffffff", area: "#00ff00" };

  it("paints a goal flat on the ground in the goal color, see-through like the viewport", () => {
    const mesh = zoneMesh(zone({}), colors);
    expect(mesh.position.toArray()).toEqual([12, 0.01, 2]);
    expect(mesh.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(mesh.material.color.getHexString()).toBe("00ff00");
    expect(mesh.material.opacity).toBe(ZONE_OPACITY);
  });

  it("stands a marked area upright where it is", () => {
    const mesh = zoneMesh(zone({ kind: "zone", shape: "box", size: [2, 4, 1], position: [1, 2, 0.5] }), colors);
    expect(mesh.rotation.x).toBe(0);
    expect(mesh.position.toArray()).toEqual([1, 0.5, -2]);
  });
});
