import type { SceneGeom } from "@icarus/contracts";
import { Box3, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { geomExtents, styleParts } from "./visual-style.ts";

function geom(shape: SceneGeom["shape"], size: SceneGeom["size"], style?: SceneGeom["style"]): SceneGeom {
  return {
    name: "part",
    body: "part",
    shape,
    size,
    position: [0, 0, 0],
    quaternion: [1, 0, 0, 0],
    color: "#c8553d",
    style,
  };
}

const STYLED: SceneGeom[] = [
  geom("box", [4, 1.8, 0.6], "car_body"),
  geom("cylinder", [0.6, 0.6, 0.25], "wheel"),
  geom("box", [0.3, 0.3, 0.4], "shell"),
  geom("sphere", [0.22, 0.22, 0.22], "shell"),
  geom("capsule", [0.09, 0.09, 0.4], "joint"),
  geom("cylinder", [0.1, 0.1, 0.5], "joint"),
  geom("box", [0.5, 0.5, 0.5], "crate"),
  geom("box", [0.2, 3, 1], "wall"),
  geom("box", [6, 0.3, 0.15], "curb"),
  geom("cylinder", [0.2, 0.2, 1], "post"),
  geom("cylinder", [0.4, 0.4, 0.7], "cone"),
  geom("cylinder", [0.5, 0.5, 4], "lamp_post"),
  geom("cylinder", [2, 2, 5], "tree"),
  geom("sphere", [0.3, 0.3, 0.3], "ball"),
  geom("box", [5, 0.12, 0.01], "marking"),
  // Library pieces at their default sizes, plus long pieces turned to lie along y and huge ones.
  geom("box", [2.4, 1.2, 0.3], "stairs"),
  geom("box", [0.3, 1.2, 0.17], "step"),
  geom("box", [4, 2, 0.12], "slab"),
  geom("box", [200, 200, 0.2], "slab"),
  geom("cylinder", [0.5, 0.5, 3], "pillar"),
  geom("box", [0.6, 0.6, 3], "pillar"),
  geom("box", [3, 0.8, 0.08], "planks"),
  geom("box", [0.5, 3, 0.08], "speed_bump"),
  geom("box", [0.2, 1.8, 0.12], "wheel_stop"),
  geom("box", [2, 0.6, 0.8], "barrier"),
  geom("box", [0.6, 2, 0.8], "barrier"),
  geom("box", [3, 0.08, 1.2], "fence"),
  geom("box", [0.08, 3, 1.2], "fence"),
  geom("box", [0.6, 0.08, 2.2], "sign"),
  geom("box", [10, 10, 18], "building"),
  geom("box", [300, 40, 400], "building"),
  geom("box", [7, 6, 5.5], "house"),
  geom("box", [4, 6.5, 3], "garage"),
  geom("box", [1.6, 0.9, 0.75], "table"),
  geom("box", [1.8, 0.5, 0.85], "bench"),
  geom("box", [1.2, 0.4, 1.8], "shelf"),
  geom("box", [1.2, 1.2, 0.9], "bush"),
  geom("sphere", [1, 1, 1], "bush"),
  geom("box", [1.2, 1, 0.7], "rock"),
  geom("cylinder", [0.6, 0.6, 0.9], "barrel"),
  geom("box", [1.2, 1.2, 1.2], "crate_stack"),
  geom("box", [2, 1.5, 0.02], "puddle"),
  geom("box", [4.2, 1.8, 1.45], "parked_car"),
];

describe("visual styles", () => {
  it("draws every style inside the collider MuJoCo simulates, never outside it", () => {
    for (const item of STYLED) {
      const parts = styleParts(item);
      expect(parts, item.style ?? "").not.toBeNull();
      const { x, y, z } = geomExtents(item);
      const bounds = new Box3();
      for (const part of parts ?? []) {
        part.geometry.computeBoundingBox();
        if (part.geometry.boundingBox) {
          bounds.union(part.geometry.boundingBox);
        }
      }
      const slack = 1e-6;
      expect(bounds.max.x, `${item.style} x`).toBeLessThanOrEqual(x / 2 + slack);
      expect(bounds.min.x, `${item.style} x`).toBeGreaterThanOrEqual(-x / 2 - slack);
      expect(bounds.max.y, `${item.style} y`).toBeLessThanOrEqual(y / 2 + slack);
      expect(bounds.min.y, `${item.style} y`).toBeGreaterThanOrEqual(-y / 2 - slack);
      expect(bounds.max.z, `${item.style} z`).toBeLessThanOrEqual(z / 2 + slack);
      expect(bounds.min.z, `${item.style} z`).toBeGreaterThanOrEqual(-z / 2 - slack);
    }
  });

  it("merges a styled part into one geometry per finish", () => {
    for (const item of STYLED) {
      const finishes = (styleParts(item) ?? []).map((part) => part.finish);
      expect(new Set(finishes).size, item.style ?? "").toBe(finishes.length);
    }
  });

  it("gives the car a painted shell, glass, bumpers, headlights at the front and tail lights at the back", () => {
    const parts = styleParts(geom("box", [4, 1.8, 0.6], "car_body")) ?? [];
    expect(parts.map((part) => part.finish).sort()).toEqual(["glass", "headlight", "paint", "taillight", "trim"]);
    const centre = (finish: string) => {
      const part = parts.find((item) => item.finish === finish);
      part?.geometry.computeBoundingBox();
      return part?.geometry.boundingBox?.getCenter(new Vector3()).x ?? 0;
    };
    expect(centre("headlight")).toBeGreaterThan(1.9);
    expect(centre("taillight")).toBeLessThan(-1.9);
  });

  it("lights a building's windows, gives a parked car its wheels and keeps huge parts to a bounded size", () => {
    const finishes = (item: SceneGeom) => (styleParts(item) ?? []).map((part) => part.finish);
    expect(finishes(geom("box", [10, 10, 18], "building"))).toContain("window");
    expect(finishes(geom("box", [4.2, 1.8, 1.45], "parked_car"))).toEqual(
      expect.arrayContaining(["paint", "glass", "rubber", "chrome"]),
    );
    const vertices = (styleParts(geom("box", [300, 40, 400], "building")) ?? []).reduce(
      (total, part) => total + part.geometry.getAttribute("position").count,
      0,
    );
    expect(vertices).toBeLessThan(300_000);
  });

  it("draws the plain primitive without a style, with a plain style, or when the style does not fit the shape", () => {
    expect(styleParts(geom("box", [1, 1, 1]))).toBeNull();
    expect(styleParts(geom("box", [1, 1, 1], "plain"))).toBeNull();
    expect(styleParts(geom("box", [1, 1, 1], "wheel"))).toBeNull();
    expect(styleParts(geom("cylinder", [1, 1, 1], "car_body"))).toBeNull();
    expect(styleParts(geom("plane", [10, 10, 0], "shell"))).toBeNull();
    expect(styleParts(geom("cylinder", [1, 1, 3], "building"))).toBeNull();
    expect(styleParts(geom("box", [1, 1, 1], "barrel"))).toBeNull();
  });
});
