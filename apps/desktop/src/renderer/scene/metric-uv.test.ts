import { BoxGeometry, type BufferGeometry } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { describe, expect, it } from "vitest";
import { metricUVs } from "./metric-uv.ts";

// The largest u and v on the faces whose normal points along `axis` (0 x, 1 y, 2 z in Three's axes).
function faceSpan(geometry: BufferGeometry, axis: number): [number, number] {
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  let u = 0;
  let v = 0;
  for (let index = 0; index < uv.count; index += 1) {
    const n = [normal.getX(index), normal.getY(index), normal.getZ(index)].map(Math.abs);
    if ((n[axis] ?? 0) > 0.99) {
      u = Math.max(u, uv.getX(index));
      v = Math.max(v, uv.getY(index));
    }
  }
  return [u, v];
}

describe("metric texture coordinates", () => {
  it("lays every face of a block column out in metres, so its sides show as many blocks as it is tall", () => {
    const column = metricUVs(new BoxGeometry(1, 3, 2), [1, 3, 2]);
    expect(faceSpan(column, 0)).toEqual([2, 3]);
    expect(faceSpan(column, 1)).toEqual([1, 2]);
    expect(faceSpan(column, 2)).toEqual([1, 3]);
  });

  it("keeps the metres on a box with rounded edges and leaves the shared geometry untouched", () => {
    const rounded = new RoundedBoxGeometry(2, 1, 2, 3, 0.1);
    const before = Array.from(rounded.getAttribute("uv").array);
    const mapped = metricUVs(rounded, [2, 1, 2]);
    // The flat top ends where the rounding starts, one radius short of the corner.
    const [u, v] = faceSpan(mapped, 1);
    expect(u).toBeCloseTo(1.9, 3);
    expect(v).toBeCloseTo(1.9, 3);
    expect(Array.from(rounded.getAttribute("uv").array)).toEqual(before);
  });
});
