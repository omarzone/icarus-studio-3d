import { describe, expect, it } from "vitest";
import { toThreePosition } from "./coordinates.ts";
import { groundColor, hemisphereLook, sunFrame } from "./scene-lighting.ts";

const SUN = {
  name: "sun",
  position: [0, 0, 10] as [number, number, number],
  direction: [0.3, 0.2, -1] as [number, number, number],
  intensity: 0.8,
};

describe("scene lighting", () => {
  it("aims the sun at the middle of the scene from back along its direction, above the ground", () => {
    const frame = sunFrame(SUN, { center: [12, 0, 0.5], radius: 8 });
    expect(frame.target).toEqual(toThreePosition([12, 0, 0.5]));
    // Three y is up: a sun shining down sits above what it lights.
    expect(frame.position[1]).toBeGreaterThan(frame.target[1]);
    const toward = frame.target.map((value, index) => value - (frame.position[index] ?? 0));
    const [x, y, z] = toThreePosition([0.3, 0.2, -1]);
    const dot = (toward[0] ?? 0) * x + (toward[1] ?? 0) * y + (toward[2] ?? 0) * z;
    expect(dot / (Math.hypot(...toward) * Math.hypot(x, y, z))).toBeCloseTo(1);
  });

  it("sizes the shadow box to hold the whole scene, and its depth range to reach past it", () => {
    const frame = sunFrame(SUN, { center: [0, 0, 0], radius: 30 });
    expect(frame.extent).toBeGreaterThanOrEqual(30);
    const distance = Math.hypot(...frame.position.map((value, index) => value - (frame.target[index] ?? 0)));
    expect(frame.far).toBeGreaterThan(distance + 30);
    expect(frame.near).toBeLessThan(distance - 30);
  });

  it("lights from the sky's horizon above and the ground's color below, as strong as the world's ambient", () => {
    const look = { top: "#5f8fc4", horizon: "#e4ecef", ambient: 1, fog: null };
    expect(hemisphereLook(look, "#3a3f47", 0.5)).toEqual({ sky: "#e4ecef", ground: "#3a3f47", intensity: 1.2 });
    expect(hemisphereLook(null, "#3a3f47", 0.5).intensity).toBeCloseTo(0.6);
    expect(
      groundColor(
        [
          { shape: "box", color: "#ff0000" },
          { shape: "plane", color: "#3a3f47" },
        ],
        "#000000",
      ),
    ).toBe("#3a3f47");
    expect(groundColor([], "#000000")).toBe("#000000");
  });
});
