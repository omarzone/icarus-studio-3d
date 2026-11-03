import type { SceneGeom } from "@icarus/contracts";
import { Box3, Mesh } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { skinApi } from "../engine-client/skin-api.ts";
import { geomObject } from "./geom-object.ts";

// One triangle 4 wide, 2 tall and 1 deep (glTF axes), as a GLB built here so no file is read or downloaded.
function triangleGlb(): ArrayBuffer {
  const positions = new Float32Array([0, 0, 0, 4, 0, 1, 0, 2, 0]);
  const json = JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [4, 2, 1] }],
    bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
    buffers: [{ byteLength: positions.byteLength }],
  });
  const text = new TextEncoder().encode(json.padEnd(Math.ceil(json.length / 4) * 4, " "));
  const total = 12 + 8 + text.length + 8 + positions.byteLength;
  const out = new DataView(new ArrayBuffer(total));
  const bytes = new Uint8Array(out.buffer);
  out.setUint32(0, 0x46546c67, true);
  out.setUint32(4, 2, true);
  out.setUint32(8, total, true);
  out.setUint32(12, text.length, true);
  out.setUint32(16, 0x4e4f534a, true);
  bytes.set(text, 20);
  out.setUint32(20 + text.length, positions.byteLength, true);
  out.setUint32(24 + text.length, 0x004e4942, true);
  bytes.set(new Uint8Array(positions.buffer), 28 + text.length);
  return out.buffer;
}

const GEOM: SceneGeom = {
  name: "van",
  body: "van",
  shape: "box",
  size: [2, 0.5, 1],
  position: [0, 0, 0.5],
  quaternion: [1, 0, 0, 0],
  color: "#9aa0a8",
};

const skinned = (asset: string): SceneGeom => ({ ...GEOM, skin: { project: "0123456789ab", asset, fill: 1 } });

describe("skinned geoms", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("draws the primitive until the model loads, then the model fitted inside the collider", async () => {
    const content = vi.spyOn(skinApi, "skinContent").mockResolvedValue(triangleGlb());
    const object = geomObject(skinned("sk00000000000000a1"));
    const fallback = object.children[0];
    expect(fallback).toBeInstanceOf(Mesh);
    await vi.waitFor(() => expect(object.children[0]).not.toBe(fallback));
    object.updateMatrixWorld(true);
    const box = new Box3().setFromObject(object);
    // The collider is 2 × 1 × 0.5 in Three axes around (0, 0.5, 0); the 4 × 2 × 1 model is halved to fill it.
    expect(box.min.toArray().map((v) => Number(v.toFixed(5)))).toEqual([-1, 0, -0.25]);
    expect(box.max.toArray().map((v) => Number(v.toFixed(5)))).toEqual([1, 1, 0.25]);
    // A second geom wearing the same model draws it at once, without fetching it again.
    const copy = geomObject({ ...skinned("sk00000000000000a1"), name: "1:van" });
    expect(copy.children[0]).not.toBeInstanceOf(Mesh);
    expect(content).toHaveBeenCalledTimes(1);
  });

  it("keeps the primitive when the model cannot be loaded", async () => {
    const content = vi.spyOn(skinApi, "skinContent").mockRejectedValue(new Error("gone"));
    const object = geomObject(skinned("sk00000000000000b2"));
    await vi.waitFor(() => expect(content).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(object.children).toHaveLength(1);
    expect(object.children[0]).toBeInstanceOf(Mesh);
  });
});
