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

  it("draws the plain primitive without a style, with a plain style, or when the style does not fit the shape", () => {
    expect(styleParts(geom("box", [1, 1, 1]))).toBeNull();
    expect(styleParts(geom("box", [1, 1, 1], "plain"))).toBeNull();
    expect(styleParts(geom("box", [1, 1, 1], "wheel"))).toBeNull();
    expect(styleParts(geom("cylinder", [1, 1, 1], "car_body"))).toBeNull();
    expect(styleParts(geom("plane", [10, 10, 0], "shell"))).toBeNull();
  });
});
