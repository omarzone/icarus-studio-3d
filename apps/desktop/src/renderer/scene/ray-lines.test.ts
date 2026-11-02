import type { SceneRay } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { easeRays, rayLine, raysShownByDefault } from "./ray-lines.ts";

const ray = (over: Partial<SceneRay> = {}): SceneRay => ({
  sensor: "car:ray0",
  label: "Car distance 1",
  origin: [1, 2, 0.5],
  direction: [1, 0, 0],
  range: 10,
  distance: null,
  ...over,
});

describe("rayLine", () => {
  it("draws a ray that hits nothing out to its full range, with no value", () => {
    expect(rayLine(ray())).toEqual({
      sensor: "car:ray0",
      label: "Car distance 1",
      from: [1, 2, 0.5],
      to: [11, 2, 0.5],
      hit: false,
      near: false,
      value: null,
    });
  });

  it("stops a ray at what it hits and marks it near inside a quarter of its range", () => {
    const near = rayLine(ray({ direction: [0, -1, 0], distance: 2 }));
    expect(near).toMatchObject({ to: [1, 0, 0.5], hit: true, near: true, value: "2.0 m" });
    expect(rayLine(ray({ distance: 3.5 }))).toMatchObject({ to: [4.5, 2, 0.5], near: false, value: "3.5 m" });
    expect(rayLine(ray({ distance: 3.44 })).value).toBe("3.4 m");
  });
});

describe("easeRays", () => {
  it("moves each ray part of the way between two frames, keeping its direction a unit vector", () => {
    const from = [ray({ distance: 2 })];
    const to = [ray({ origin: [3, 2, 0.5], direction: [0, 1, 0], distance: 4 })];
    const [eased] = easeRays(from, to, 0.5);
    expect(eased?.origin).toEqual([2, 2, 0.5]);
    expect(eased?.direction[0]).toBeCloseTo(Math.SQRT1_2);
    expect(eased?.direction[1]).toBeCloseTo(Math.SQRT1_2);
    expect(eased?.distance).toBe(3);
  });

  it("shows a hit appearing or vanishing as the newest frame has it, and new rays as they are", () => {
    const appearing = easeRays([ray()], [ray({ distance: 5 })], 0.2);
    expect(appearing[0]?.distance).toBe(5);
    const vanishing = easeRays([ray({ distance: 5 })], [ray()], 0.2);
    expect(vanishing[0]?.distance).toBeNull();
    const fresh = ray({ sensor: "car:ray1" });
    expect(easeRays([], [fresh], 0.5)).toEqual([fresh]);
  });
});

describe("raysShownByDefault", () => {
  it("shows rays where the agent senses and acts, and hides them while editing unless the view is about senses", () => {
    expect(raysShownByDefault("play", false)).toBe(true);
    expect(raysShownByDefault("live-training", false)).toBe(true);
    expect(raysShownByDefault("scene", false)).toBe(false);
    expect(raysShownByDefault("scene", true)).toBe(true);
  });
});
