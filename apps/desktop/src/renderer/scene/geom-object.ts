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
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { toThreePosition, toThreeQuaternion } from "./coordinates.ts";
import { bevelRadius, geomShape } from "./geom-shape.ts";
import { drawnSize, isGround } from "./ground-geom.ts";
import { groundMarks } from "./ground-marks.ts";
import { metricUVs } from "./metric-uv.ts";
import { partFinish } from "./part-finish.ts";
import { floorDepth } from "./scene-materials.ts";
import { skinnedObject } from "./skin-models.ts";
import { grainImage, grainMetres } from "./surface-grain.ts";
import type { Grain, MaterialLook } from "./visual-styles/finishes.ts";
import { plainLook, styledLook } from "./visual-styles/part-look.ts";
import { type StylePart, styleParts } from "./visual-styles/visual-style.ts";
import { wedgeGeometry } from "./wedge-geometry.ts";

// Geometries, materials and grain images are shared by every geom that draws the same way (the copies of a training
// run all reuse one set), and live as long as the app: each is small and the set of distinct parts is bounded.
const geometries = new Map<string, BufferGeometry>();
const styled = new Map<string, StylePart[] | null>();
const materials = new Map<string, Material>();
const grains = new Map<Grain, DataTexture>();

// How brightly a lit vehicle lamp glows.
const LAMP_GLOW = 2.5;

const sizeKey = (geom: SceneGeom) => `${geom.shape}:${geom.size.map((value) => value.toFixed(4)).join(",")}`;

// Rounding segments of a bevelled box's edges.
const BEVEL_SEGMENTS = 3;

// How a primitive is built: with its rounded edges (drawing only; outlines show the sharp collider) and with
// texture coordinates in metres for patterns that keep their real size.
type Build = { rounded: boolean; metric: boolean };

function primitive(geom: SceneGeom, build: Build = { rounded: false, metric: false }): BufferGeometry {
  const radius = build.rounded ? bevelRadius(geom) : 0;
  const key = `${sizeKey(geom)}:${radius.toFixed(4)}:${build.metric}`;
  const cached = geometries.get(key);
  if (cached) {
    return cached;
  }
  const shape = geomShape(geom);
  const made = (() => {
    switch (shape.kind) {
      case "box":
        return radius > 0
          ? new RoundedBoxGeometry(...shape.args, BEVEL_SEGMENTS, radius)
          : new BoxGeometry(...shape.args);
      case "sphere":
        return new SphereGeometry(...shape.args);
      case "cylinder":
        return new CylinderGeometry(...shape.args);
      case "capsule":
        return new CapsuleGeometry(...shape.args);
      case "wedge":
        return wedgeGeometry(shape.shape, shape.size);
    }
  })();
  const created = build.metric && shape.kind === "box" ? metricUVs(made, shape.args) : made;
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

// A pattern laid in metres on every face (see metricUVs) rather than stretched over each face: blocks, wedges (whose
// faces are always measured), palette materials and ground slabs on boxes, whose sides then show the same pattern.
function metricPattern(grain: Grain | undefined, geom: SceneGeom): boolean {
  if (geom.shape === "wedge" || geom.shape === "corner_wedge" || grain === "blocks") {
    return true;
  }
  return geom.shape === "box" && (Boolean(geom.material) || geom.ground === true);
}

// How often the grain repeats so one tile covers its metres on the geom's widest faces (x and MuJoCo y).
function repeats(grain: Grain, geom: SceneGeom, metric: boolean): [number, number] {
  const metres = grainMetres(grain);
  if (metric) {
    return [1 / metres, 1 / metres];
  }
  const [x, y] = drawnSize(geom);
  const round = (value: number) => Math.round(Math.max(1, value / metres) * 100) / 100;
  return [round(x), round(y)];
}

function material(look: MaterialLook, color: string, geom: SceneGeom, metric = false): Material {
  const repeat = look.grain ? repeats(look.grain, geom, metric) : null;
  const finish = partFinish(geom);
  const key = JSON.stringify([look, color, repeat, isGround(geom), finish]);
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
    ...floorDepth(geom),
    ...(look.decal ? { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } : {}),
  };
  const created =
    look.clearcoat === undefined
      ? new MeshStandardMaterial(settings)
      : new MeshPhysicalMaterial({ ...settings, clearcoat: look.clearcoat, clearcoatRoughness: 0.2 });
  materials.set(key, created);
  return created;
}

function mesh(geometry: BufferGeometry, look: MaterialLook, geom: SceneGeom, metric = false): Mesh {
  const created = new Mesh(geometry, material(look, geom.color, geom, metric));
  created.castShadow = !isGround(geom) && !look.decal && geom.cast_shadow !== false;
  created.receiveShadow = true;
  return created;
}

// A vehicle light glows on its own, so it gets materials no other part shares; `lampGlow` switches them.
function ownLampMaterials(drawn: Object3D, geom: SceneGeom) {
  drawn.traverse((child) => {
    if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
      child.material = child.material.clone();
      child.material.emissive = new Color(geom.color);
      child.userData.lamp = true;
    }
  });
}

// Lights a vehicle lamp's meshes in their own color while the engine reports that light on.
export function lampGlow(object: Object3D, on: boolean) {
  object.traverse((child) => {
    if (child.userData.lamp && child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
      child.material.emissiveIntensity = on ? LAMP_GLOW : 0;
    }
  });
}

// The Three object a geom is drawn with, placed at its pose: its styled pieces when it has a style that fits, else
// its plain primitive in the material its surface gives; a skin's model fitted inside it once loaded (ADR 008).
// Parts never decide physics; this only draws them.
export function geomObject(geom: SceneGeom): Object3D {
  const pieces = parts(geom);
  const look = plainLook(geom);
  const metric = metricPattern(look.grain, geom);
  const drawn = pieces
    ? new Group().add(...pieces.map((piece) => mesh(piece.geometry, styledLook(piece.finish, geom), geom)))
    : mesh(primitive(geom, { rounded: true, metric }), look, geom, metric);
  const marks = groundMarks(geom);
  if (marks) {
    drawn.add(marks);
  }
  const object = geom.skin ? skinnedObject(geom, geom.skin, drawn) : drawn;
  if (geom.light_role) {
    ownLampMaterials(drawn, geom);
  }
  object.position.set(...toThreePosition(geom.position));
  object.quaternion.set(...toThreeQuaternion(geom.quaternion));
  object.name = geom.name;
  return object;
}

// The plain primitive's geometry, for outlines of a selected part (its collider) and see-through proposals.
export function geomGeometry(geom: SceneGeom): BufferGeometry {
  return primitive(geom);
}
