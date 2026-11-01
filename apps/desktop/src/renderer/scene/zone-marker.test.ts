import type { SceneZone } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { zoneMarker } from "./zone-marker.ts";

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
