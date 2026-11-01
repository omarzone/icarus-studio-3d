import type { SceneGeom } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { toThreePosition } from "./coordinates.ts";
import { sceneBounds, thumbnailCamera } from "./thumbnail-framing.ts";

const IDENTITY: [number, number, number, number] = [1, 0, 0, 0];

function geom(
  shape: SceneGeom["shape"],
  position: [number, number, number],
  size: [number, number, number],
): SceneGeom {
  return {
    name: `${shape}-${position.join(",")}`,
    body: "b",
    color: "#808080",
    shape,
    position,
    size,
    quaternion: IDENTITY,
  };
}

const distance = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(...a.map((value, index) => value - (b[index] ?? 0)));

describe("scene bounds", () => {
  const box = geom("box", [0, 0, 0.5], [2, 1, 1]);
  const ball = geom("sphere", [3, 0, 0.25], [0.5, 0.5, 0.5]);

  it("encloses every corner of a box and the far side of a sphere", () => {
    const bounds = sceneBounds([box, ball]);
    expect(bounds).not.toBeNull();
    if (!bounds) {
      return;
    }
    for (const corner of [
      [-1, -0.5, 0],
      [1, 0.5, 1],
      [-1, 0.5, 1],
    ]) {
      expect(distance(corner, bounds.center)).toBeLessThanOrEqual(bounds.radius + 1e-9);
    }
    expect(distance([3.25, 0, 0.25], bounds.center)).toBeLessThanOrEqual(bounds.radius + 1e-9);
  });

  it("ignores the ground plane, which would shrink the subject to a dot", () => {
    const withFloor = sceneBounds([geom("plane", [0, 0, 0], [40, 40, 0.1]), box]);
    expect(withFloor).toEqual(sceneBounds([box]));
  });

  it("has no bounds when only planes are left", () => {
    expect(sceneBounds([geom("plane", [0, 0, 0], [40, 40, 0.1])])).toBeNull();
  });
});

describe("thumbnail camera", () => {
  const bounds = { center: [1, 2, 0.5] as [number, number, number], radius: 1.5 };

  it("looks at the center of the bounds in Three's axes", () => {
    expect(thumbnailCamera(bounds, 2).target).toEqual(toThreePosition(bounds.center));
  });

  it("sits above and to the side of the subject, a three-quarter view", () => {
    const { position, target } = thumbnailCamera(bounds, 2);
    expect(position[1]).toBeGreaterThan(target[1]);
    expect(Math.abs(position[0] - target[0])).toBeGreaterThan(0.1);
    expect(Math.abs(position[2] - target[2])).toBeGreaterThan(0.1);
  });

  it("keeps the whole bounding sphere inside the narrower field of view", () => {
    for (const aspect of [0.5, 1, 2.4]) {
      const camera = thumbnailCamera(bounds, aspect);
      const away = distance(camera.position, camera.target);
      const vertical = (camera.fov * Math.PI) / 180;
      const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
      expect(away * Math.sin(Math.min(vertical, horizontal) / 2)).toBeGreaterThanOrEqual(bounds.radius);
      expect(camera.near).toBeLessThan(away - bounds.radius);
      expect(camera.far).toBeGreaterThan(away + bounds.radius);
    }
  });

  it("moves back in proportion to the size of the subject", () => {
    const small = thumbnailCamera(bounds, 2);
    const large = thumbnailCamera({ ...bounds, radius: 3 }, 2);
    const ratio = distance(large.position, large.target) / distance(small.position, small.target);
    expect(ratio).toBeCloseTo(2, 6);
  });

  it("frames the area around the origin when there is nothing but ground", () => {
    expect(distance(thumbnailCamera(null, 2).target, [0, 0, 0])).toBe(0);
  });
});
