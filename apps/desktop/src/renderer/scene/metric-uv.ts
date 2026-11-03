import type { BufferGeometry } from "three";

// A copy of a box-like geometry whose texture coordinates are metres from its corner on every face, each face mapped
// across the axes it spans, so a pattern keeps its real size on the sides as on the top (blocks stay square).
export function metricUVs(
  geometry: BufferGeometry,
  [width, height, depth]: readonly [number, number, number],
): BufferGeometry {
  const copy = geometry.clone();
  const position = copy.getAttribute("position");
  const normal = copy.getAttribute("normal");
  const uv = copy.getAttribute("uv");
  if (!position || !normal || !uv) {
    return copy;
  }
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index) + width / 2;
    const y = position.getY(index) + height / 2;
    const z = position.getZ(index) + depth / 2;
    const nx = Math.abs(normal.getX(index));
    const ny = Math.abs(normal.getY(index));
    const nz = Math.abs(normal.getZ(index));
    if (nx >= ny && nx >= nz) {
      uv.setXY(index, z, y);
    } else if (ny >= nz) {
      uv.setXY(index, x, z);
    } else {
      uv.setXY(index, x, y);
    }
  }
  uv.needsUpdate = true;
  return copy;
}
