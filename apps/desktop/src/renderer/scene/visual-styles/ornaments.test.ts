import type { SceneOrnament } from "@icarus/contracts";
import { Box3 } from "three";
import { describe, expect, it } from "vitest";
import { ornamentExtents, ornamentParts } from "./ornaments.ts";

const STYLES: SceneOrnament["style"][] = [
  "crown_round",
  "crown_cone",
  "crown_oval",
  "lamp_arm",
  "gate_arm",
  "sign_plate",
  "shrubs",
];
const SIZES: Record<SceneOrnament["style"], SceneOrnament["size"]> = {
  crown_round: [3.6, 3.6, 3.4],
  crown_cone: [2.8, 2.8, 5],
  crown_oval: [2.2, 2.2, 4.6],
  lamp_arm: [2, 0.4, 0.45],
  gate_arm: [3.6, 0.12, 0.12],
  sign_plate: [0.05, 0.6, 0.6],
  shrubs: [1.4, 0.62, 0.6],
};

describe("ornaments", () => {
  it("draws every ornament at its own designed size, inside the extents it was given", () => {
    for (const style of STYLES) {
      const ornament = { style, size: SIZES[style] };
      const { main, accent } = ornamentParts(ornament);
      expect(main.length, style).toBeGreaterThan(0);
      const bounds = new Box3();
      for (const part of [...main, ...accent]) {
        part.geometry.computeBoundingBox();
        if (part.geometry.boundingBox) {
          bounds.union(part.geometry.boundingBox);
        }
      }
      const { x, y, z } = ornamentExtents(ornament);
      const slack = 1e-6;
      expect(bounds.max.x, `${style} x`).toBeLessThanOrEqual(x / 2 + slack);
      expect(bounds.min.x, `${style} x`).toBeGreaterThanOrEqual(-x / 2 - slack);
      expect(bounds.max.y, `${style} y`).toBeLessThanOrEqual(y / 2 + slack);
      expect(bounds.min.y, `${style} y`).toBeGreaterThanOrEqual(-y / 2 - slack);
      expect(bounds.max.z, `${style} z`).toBeLessThanOrEqual(z / 2 + slack);
      expect(bounds.min.z, `${style} z`).toBeGreaterThanOrEqual(-z / 2 - slack);
      // A crown fills most of its box: a canopy, not a twig.
      if (style.startsWith("crown")) {
        expect(bounds.max.x - bounds.min.x, style).toBeGreaterThan(x * 0.8);
      }
    }
  });

  it("stripes a gate boom, lights a lamp head and puts the symbol on a sign in the accent color", () => {
    const finishes = (style: SceneOrnament["style"]) =>
      ornamentParts({ style, size: SIZES[style] }).accent.map((part) => part.finish);
    expect(finishes("gate_arm")).toEqual(["paint"]);
    expect(finishes("lamp_arm")).toEqual(["lamp"]);
    expect(finishes("sign_plate")).toEqual(["paint"]);
    expect(finishes("crown_round")).toEqual([]);
  });
});
