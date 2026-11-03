import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { toThreePosition } from "./coordinates.ts";
import { wedgeCorners, wedgeGeometry } from "./wedge-geometry.ts";

describe("wedge geometry", () => {
  it("has the engine's corners: a wedge's top edge along -y, a corner wedge's peak over +x, -y", () => {
    expect(wedgeCorners("wedge", [2, 4, 1]).filter(([, , z]) => z > 0)).toEqual([
      [-1, -2, 0.5],
      [1, -2, 0.5],
    ]);
    expect(wedgeCorners("corner_wedge", [2, 4, 1]).filter(([, , z]) => z > 0)).toEqual([[1, -2, 0.5]]);
  });

  it.each(["wedge", "corner_wedge"] as const)("fills the part's box and every %s face points outward", (shape) => {
    const geometry = wedgeGeometry(shape, [2, 4, 1]);
    const box = geometry.boundingBox;
    // Three is y-up: the 1 m height is its y, the 4 m depth its z.
    expect(box?.getSize(new Vector3()).toArray()).toEqual([2, 1, 4]);
    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    // The mean of the corners lies inside the solid.
    const inside = new Vector3();
    for (const corner of wedgeCorners(shape, [2, 4, 1])) {
      inside.add(new Vector3(...toThreePosition(corner)));
    }
    inside.divideScalar(wedgeCorners(shape, [2, 4, 1]).length);
    const center = new Vector3();
    for (let vertex = 0; vertex < positions.count; vertex += 3) {
      // Each triangle's normal points away from the inside of the solid.
      center.set(0, 0, 0);
      for (let corner = 0; corner < 3; corner += 1) {
        center.add(new Vector3().fromBufferAttribute(positions, vertex + corner));
      }
      center.divideScalar(3).sub(inside);
      const normal = new Vector3().fromBufferAttribute(normals, vertex);
      expect(center.dot(normal)).toBeGreaterThan(0);
    }
  });
});
