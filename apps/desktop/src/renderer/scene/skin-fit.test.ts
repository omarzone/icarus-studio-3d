import type { SceneGeom, SceneSkin } from "@icarus/contracts";
import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { type ModelBounds, type SkinPlacement, skinPlacement } from "./skin-fit.ts";

// A 2 m long, 0.5 m wide, 1 m tall collider (MuJoCo axes: X, Y, Z-up).
const GEOM: SceneGeom = {
  name: "van",
  body: "van",
  shape: "box",
  size: [2, 0.5, 1],
  position: [0, 0, 0.5],
  quaternion: [1, 0, 0, 0],
  color: "#9aa0a8",
};
const SKIN: SceneSkin = { project: "0123456789ab", asset: "sk0123456789abcdef", fill: 1 };
// The same shape authored twice as large and off-centre, in glTF axes (Y-up): 4 wide, 2 tall, 1 deep.
const MODEL: ModelBounds = { min: [10, 0, -1], max: [14, 2, 0] };

function fit(geom: SceneGeom, skin: SceneSkin, bounds: ModelBounds): SkinPlacement {
  const placement = skinPlacement(geom, skin, bounds);
  if (!placement) {
    throw new Error("nothing was fitted");
  }
  return placement;
}

function placedCorners(placement: SkinPlacement, bounds: ModelBounds): Vector3[] {
  const turn = new Quaternion(...placement.quaternion);
  return [0, 1, 2, 3, 4, 5, 6, 7].map((index) =>
    new Vector3(
      index & 1 ? bounds.max[0] : bounds.min[0],
      index & 2 ? bounds.max[1] : bounds.min[1],
      index & 4 ? bounds.max[2] : bounds.min[2],
    )
      .applyQuaternion(turn)
      .multiplyScalar(placement.scale)
      .add(new Vector3(...placement.position)),
  );
}

// Half the collider's box in the geom's Three frame (MuJoCo z is Three's y).
const HALF = new Vector3(1, 0.5, 0.25);

function inside(corners: Vector3[]): boolean {
  return corners.every((corner) =>
    (["x", "y", "z"] as const).every((key) => Math.abs(corner[key]) <= HALF[key] + 1e-9),
  );
}

describe("skin placement", () => {
  it("scales a model uniformly to fill the collider and centres it on the part", () => {
    const placement = fit(GEOM, SKIN, MODEL);
    expect(placement.scale).toBeCloseTo(0.5);
    const corners = placedCorners(placement, MODEL);
    expect(Math.min(...corners.map((c) => c.x))).toBeCloseTo(-1);
    expect(Math.max(...corners.map((c) => c.y))).toBeCloseTo(0.5);
    expect(Math.min(...corners.map((c) => c.z))).toBeCloseTo(-0.25);
  });

  it("never draws a model outside its collider, whatever its turn, fill or offset", () => {
    const cases: Partial<SceneSkin>[] = [
      { rotation: [0, 0, 90] },
      { rotation: [30, 45, 60], fill: 0.7 },
      { fill: 0.5, offset: [100, -100, 100] },
      { rotation: [0, 0, 90], fill: 0.3, offset: [-5, 5, -5] },
    ];
    for (const extra of cases) {
      expect(inside(placedCorners(fit(GEOM, { ...SKIN, ...extra }, MODEL), MODEL))).toBe(true);
    }
  });

  it("pushes a shrunken model as far as the offset asks, up to the collider's wall", () => {
    const placement = fit(GEOM, { ...SKIN, fill: 0.5, offset: [100, 0, 0] }, MODEL);
    const corners = placedCorners(placement, MODEL);
    expect(Math.max(...corners.map((c) => c.x))).toBeCloseTo(1);
    expect(Math.min(...corners.map((c) => c.x))).toBeCloseTo(0);
  });

  it("turns a model a quarter around the part's up axis so its length runs along the part's Y", () => {
    const square: SceneGeom = { ...GEOM, size: [1, 1, 1] };
    const placement = fit(square, { ...SKIN, rotation: [0, 0, 90] }, MODEL);
    const corners = placedCorners(placement, MODEL);
    const span = (key: "x" | "z") => Math.max(...corners.map((c) => c[key])) - Math.min(...corners.map((c) => c[key]));
    // MuJoCo Y is Three's -z: the 4 m length now runs there, so it fills the depth and leaves the width.
    expect(span("z")).toBeCloseTo(1);
    expect(span("x")).toBeCloseTo(0.25);
  });

  it("draws nothing over a plane or a flat model", () => {
    expect(skinPlacement({ ...GEOM, shape: "plane", size: [10, 10, 0] }, SKIN, MODEL)).toBeNull();
    expect(skinPlacement(GEOM, SKIN, { min: [0, 0, 0], max: [0, 0, 0] })).toBeNull();
  });
});
