import { describe, expect, it } from "vitest";
import {
  eulerToQuat,
  poseUnder,
  type Quat,
  quatToEuler,
  rotate,
  stretchedScale,
  turnedRotation,
  worldToParent,
} from "./object-transform.ts";

const HALF = Math.SQRT1_2;
const AROUND_Z: Quat = [HALF, 0, 0, HALF];
const AROUND_X: Quat = [HALF, HALF, 0, 0];

function expectClose(actual: readonly number[], expected: readonly number[]) {
  expect(actual).toHaveLength(expected.length);
  for (const [index, value] of actual.entries()) {
    expect(value).toBeCloseTo(expected[index] ?? Number.NaN, 4);
  }
}

describe("rotations", () => {
  it("applies X, then Y, then Z around the object's own axes, as the engine builds its quaternion", () => {
    // 90° about X turns the object's Y onto world Z; 90° about that turned Y then swings its X onto world Y.
    expectClose(rotate(eulerToQuat([90, 90, 0]), [1, 0, 0]), [0, 1, 0]);
    expectClose(rotate(eulerToQuat([0, 0, 90]), [1, 0, 0]), [0, 1, 0]);
  });

  it("reads back the angles a quaternion was built from, gimbal lock included", () => {
    expectClose(quatToEuler(eulerToQuat([30, -45, 60])), [30, -45, 60]);
    const locked = eulerToQuat([20, 90, 0]);
    expectClose(rotate(eulerToQuat(quatToEuler(locked)), [0, 1, 0]), rotate(locked, [0, 1, 0]));
  });

  it("moves a world delta into a parent's frame", () => {
    // Parent turned 90° about z: a world +x move is a local −y move.
    expectClose(worldToParent([1, 0, 0], AROUND_Z), [0, -1, 0]);
  });

  it("turns an object by a world rotation, expressed under its parent", () => {
    expectClose(turnedRotation([0, 0, 0], AROUND_Z), [0, 0, 90]);
    // Under a parent turned 90° about z, world X is the parent's −Y.
    expectClose(turnedRotation([0, 0, 0], AROUND_X, AROUND_Z), [0, -90, 0]);
    expectClose(turnedRotation([0, 0, 45], AROUND_Z), [0, 0, 135]);
  });
});

describe("stretchedScale", () => {
  it("multiplies each axis and stays inside the Transform's range", () => {
    expect(stretchedScale([1, 2, 1], [2, 0.5, 1])).toEqual([2, 1, 1]);
    expect(stretchedScale([60, 0.02, 1], [2, 0.1, -3])).toEqual([100, 0.01, 3]);
  });
});

describe("poseUnder", () => {
  it("keeps an object where it is in the world under a new parent", () => {
    const pose = poseUnder(
      { position: [2, 1, 0], quaternion: AROUND_Z },
      { position: [1, 1, 0], quaternion: AROUND_Z },
    );
    expectClose(pose.position, [0, -1, 0]);
    expectClose(pose.rotation, [0, 0, 0]);
  });

  it("uses world values at the top level", () => {
    const pose = poseUnder({ position: [2, 1, 0.5], quaternion: AROUND_X }, null);
    expectClose(pose.position, [2, 1, 0.5]);
    expectClose(pose.rotation, [90, 0, 0]);
  });
});
