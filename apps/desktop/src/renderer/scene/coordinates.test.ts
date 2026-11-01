import { describe, expect, it } from "vitest";
import { fromThreePosition, toThreePosition, toThreeQuaternion } from "./coordinates.ts";

function close(actual: readonly number[], expected: readonly number[]) {
  for (const [index, value] of actual.entries()) {
    expect(value).toBeCloseTo(expected[index] ?? Number.NaN, 6);
  }
}

describe("MuJoCo to Three.js", () => {
  it("maps MuJoCo's up axis (z) to Three's up axis (y)", () => {
    close(toThreePosition([0, 0, 1]), [0, 1, 0]);
    close(toThreePosition([1, 2, 3]), [1, 3, -2]);
  });

  it("round-trips positions", () => {
    close(fromThreePosition(toThreePosition([1.5, -2, 0.3])), [1.5, -2, 0.3]);
  });

  it("keeps the identity rotation", () => {
    close(toThreeQuaternion([1, 0, 0, 0]), [0, 0, 0, 1]);
  });

  it("turns a rotation about MuJoCo z into a rotation about Three y", () => {
    const half = Math.SQRT1_2;
    close(toThreeQuaternion([half, 0, 0, half]), [0, half, 0, half]);
  });
});
