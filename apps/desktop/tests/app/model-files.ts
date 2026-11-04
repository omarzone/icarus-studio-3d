// A red four-sided pyramid as a GLB built here (no file is read or downloaded): 2 wide, 1 tall, 2 deep in glTF axes.
export function pyramidGlb(): Buffer {
  const positions = new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4, 0, 2, 1, 0, 3, 2]);
  const binary = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(indices.buffer)]);
  const json = JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.85, 0.1, 0.1, 1], metallicFactor: 0 } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 5, type: "VEC3", min: [-1, 0, -1], max: [1, 1, 1] },
      { bufferView: 1, componentType: 5123, count: 18, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength },
    ],
    buffers: [{ byteLength: binary.length }],
  });
  const text = Buffer.from(json.padEnd(Math.ceil(json.length / 4) * 4, " "));
  const padded = Buffer.concat([binary, Buffer.alloc(-binary.length & 3)]);
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "ascii");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + text.length + 8 + padded.length, 8);
  const chunk = (data: Buffer, kind: number) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.writeUInt32LE(kind, 4);
    return Buffer.concat([head, data]);
  };
  return Buffer.concat([header, chunk(text, 0x4e4f534a), chunk(padded, 0x004e4942)]);
}
