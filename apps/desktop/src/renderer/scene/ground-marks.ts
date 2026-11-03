import type { SceneGeom } from "@icarus/contracts";
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
} from "three";

type Decal = NonNullable<SceneGeom["decal"]>;

const SIZE = 64;
// Share of a cell taken by a grid line, and a stud's radius as a share of its cell.
const LINE = 0.03;
const STUD = 0.3;
// The marks float this far over the slab's top so the depth buffer keeps them in front.
const LIFT = 0.002;

// One cell of the marks as RGBA texels: dark see-through grid lines, or a round stud lit from the top left with a
// shadow on its lower right. Generated, never downloaded.
export function markTexels(decal: Decal): Uint8Array {
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const u = (x + 0.5) / SIZE;
      const v = (y + 0.5) / SIZE;
      const [shade, alpha] = decal === "grid" ? gridTexel(u, v) : studTexel(u, v);
      const index = (y * SIZE + x) * 4;
      pixels[index] = shade;
      pixels[index + 1] = shade;
      pixels[index + 2] = shade;
      pixels[index + 3] = alpha;
    }
  }
  return pixels;
}

function gridTexel(u: number, v: number): [number, number] {
  const edge = Math.min(u, 1 - u, v, 1 - v);
  return edge < LINE / 2 ? [0, 90] : [0, 0];
}

function studTexel(u: number, v: number): [number, number] {
  const dx = u - 0.5;
  const dy = v - 0.5;
  const distance = Math.hypot(dx, dy);
  if (distance < STUD) {
    // Brighter toward the top left of the stud's face, darker toward its rim.
    const lit = 0.5 - (dx + dy) * 0.6;
    const rim = distance > STUD * 0.85 ? -0.25 : 0;
    return [Math.round(Math.min(1, Math.max(0, lit + rim + 0.25)) * 255), 45];
  }
  const shadow = distance < STUD * 1.25 && dx + dy > 0 ? 35 : 0;
  return [0, shadow];
}

const textures = new Map<Decal, DataTexture>();

function markTexture(decal: Decal): DataTexture {
  const cached = textures.get(decal);
  if (cached) {
    return cached;
  }
  const texture = new DataTexture(markTexels(decal), SIZE, SIZE);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  textures.set(decal, texture);
  return texture;
}

// The marks on a ground slab's top, in the slab's own frame; null for any other geom or a slab without marks.
export function groundMarks(geom: SceneGeom): Mesh | null {
  if (!geom.ground || geom.shape !== "box" || !geom.decal) {
    return null;
  }
  const [width, depth, thickness] = geom.size;
  const cell = Math.max(geom.decal_cell ?? 1, 0.05);
  const map = markTexture(geom.decal).clone();
  map.repeat.set(width / cell, depth / cell);
  map.needsUpdate = true;
  const marks = new Mesh(
    new PlaneGeometry(width, depth),
    new MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.8, metalness: 0 }),
  );
  marks.rotation.x = -Math.PI / 2;
  marks.position.y = thickness / 2 + LIFT;
  marks.receiveShadow = true;
  marks.raycast = () => undefined;
  return marks;
}
