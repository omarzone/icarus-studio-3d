import type { SceneGeom } from "@icarus/contracts";
import {
  BoxGeometry,
  type BufferGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  type Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  type Texture,
} from "three";
import { toThreePosition, toThreeQuaternion } from "./coordinates.ts";
import { geomShape } from "./geom-shape.ts";
import { partFinish } from "./part-finish.ts";
import { floorDepth } from "./scene-materials.ts";
import { grainImage, grainMetres } from "./surface-grain.ts";
import type { Grain, MaterialLook } from "./visual-styles/finishes.ts";
import { plainLook, styledLook } from "./visual-styles/part-look.ts";
import { type StylePart, styleParts } from "./visual-styles/visual-style.ts";

// Geometries, materials and grain images are shared by every geom that draws the same way (the copies of a training
// run all reuse one set), and live as long as the app: each is small and the set of distinct parts is bounded.
const geometries = new Map<string, BufferGeometry>();
const styled = new Map<string, StylePart[] | null>();
const materials = new Map<string, Material>();
const grains = new Map<Grain, DataTexture>();

const sizeKey = (geom: SceneGeom) => `${geom.shape}:${geom.size.map((value) => value.toFixed(4)).join(",")}`;

function primitive(geom: SceneGeom): BufferGeometry {
  const key = sizeKey(geom);
  const cached = geometries.get(key);
  if (cached) {
    return cached;
  }
  const shape = geomShape(geom);
  const created = (() => {
    switch (shape.kind) {
      case "box":
        return new BoxGeometry(...shape.args);
      case "sphere":
        return new SphereGeometry(...shape.args);
      case "cylinder":
        return new CylinderGeometry(...shape.args);
      case "capsule":
        return new CapsuleGeometry(...shape.args);
    }
  })();
  geometries.set(key, created);
  return created;
}

function parts(geom: SceneGeom): StylePart[] | null {
  const key = `${geom.style ?? ""}:${sizeKey(geom)}`;
  if (!styled.has(key)) {
    styled.set(key, styleParts(geom));
  }
  return styled.get(key) ?? null;
}

function grainTexture(grain: Grain): DataTexture {
  const cached = grains.get(grain);
  if (cached) {
    return cached;
  }
  const image = grainImage(grain);
  const texture = new DataTexture(image.pixels, image.size, image.size);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  grains.set(grain, texture);
  return texture;
}

// How often the grain repeats so one tile covers its metres on the geom's widest faces (x and MuJoCo y).
function repeats(grain: Grain, geom: SceneGeom): [number, number] {
  const metres = grainMetres(grain);
  const [x, y] = geom.size;
  const round = (value: number) => Math.round(Math.max(1, value / metres) * 100) / 100;
  return [round(x), round(y)];
}

function material(look: MaterialLook, color: string, geom: SceneGeom): Material {
  const repeat = look.grain ? repeats(look.grain, geom) : null;
  const finish = partFinish(geom);
  const key = JSON.stringify([look, color, repeat, geom.shape === "plane", finish]);
  const cached = materials.get(key);
  if (cached) {
    return cached;
  }
  let map: Texture | null = null;
  if (look.grain && repeat) {
    map = grainTexture(look.grain).clone();
    map.repeat.set(...repeat);
    map.needsUpdate = true;
  }
  const tint = new Color(look.color ?? color);
  if (look.shade) {
    tint.multiplyScalar(look.shade);
  }
  const opacity = finish.opacity * (look.opacity ?? 1);
  const settings = {
    color: tint,
    roughness: look.roughness * finish.roughness,
    metalness: look.metalness,
    envMapIntensity: finish.envMapIntensity,
    ...(opacity < 1 ? { transparent: true, opacity, depthWrite: false } : {}),
    map,
    emissive: look.emissive ? new Color(look.glow ?? tint) : new Color(0),
    emissiveIntensity: look.emissive ?? 0,
    ...floorDepth(geom.shape),
    ...(look.decal ? { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } : {}),
  };
  const created =
    look.clearcoat === undefined
      ? new MeshStandardMaterial(settings)
      : new MeshPhysicalMaterial({ ...settings, clearcoat: look.clearcoat, clearcoatRoughness: 0.2 });
  materials.set(key, created);
  return created;
}

function mesh(geometry: BufferGeometry, look: MaterialLook, geom: SceneGeom): Mesh {
  const created = new Mesh(geometry, material(look, geom.color, geom));
  created.castShadow = geom.shape !== "plane" && !look.decal && geom.cast_shadow !== false;
  created.receiveShadow = true;
  return created;
}

// The Three object a geom is drawn with, placed at its pose: its styled pieces when it has a style that fits, else
// its plain primitive in the material its surface gives. Parts never decide physics; this only draws them.
export function geomObject(geom: SceneGeom): Object3D {
  const pieces = parts(geom);
  const object = pieces
    ? new Group().add(...pieces.map((piece) => mesh(piece.geometry, styledLook(piece.finish, geom), geom)))
    : mesh(primitive(geom), plainLook(geom), geom);
  object.position.set(...toThreePosition(geom.position));
  object.quaternion.set(...toThreeQuaternion(geom.quaternion));
  object.name = geom.name;
  return object;
}

// The plain primitive's geometry, for outlines of a selected part (its collider) and see-through proposals.
export function geomGeometry(geom: SceneGeom): BufferGeometry {
  return primitive(geom);
}
