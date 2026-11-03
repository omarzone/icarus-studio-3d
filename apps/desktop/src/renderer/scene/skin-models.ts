import type { SceneGeom, SceneSkin } from "@icarus/contracts";
import { Box3, Camera, Group, Light, Mesh, type Object3D } from "three";
import { skinApi } from "../engine-client/skin-api.ts";
import { type ModelBounds, skinPlacement } from "./skin-fit.ts";

// A stored model parsed once, and how to make a copy of it for one more geom (copies share geometry and textures).
type LoadedSkin = { bounds: ModelBounds; copy: () => Object3D };

// Model ids come from their content, so a parsed model never goes stale; a failed one stays failed until restart.
const ready = new Map<string, LoadedSkin | null>();
const loading = new Map<string, Promise<LoadedSkin | null>>();

const keyOf = (skin: SceneSkin) => `${skin.project}/${skin.asset}`;

async function parse(skin: SceneSkin): Promise<LoadedSkin | null> {
  const data = await skinApi.skinContent(skin.project, skin.asset);
  const [{ GLTFLoader }, { clone }] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/utils/SkeletonUtils.js"),
  ]);
  const model = (await new GLTFLoader().parseAsync(data, "")).scene;
  // A file's own lights and cameras would change the world's look; only its shapes are drawn.
  const extras: Object3D[] = [];
  model.traverse((child) => {
    if (child instanceof Light || child instanceof Camera) {
      extras.push(child);
    } else if (child instanceof Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  for (const extra of extras) {
    extra.removeFromParent();
  }
  model.updateMatrixWorld(true);
  const box = new Box3().setFromObject(model);
  if (box.isEmpty()) {
    return null;
  }
  return { bounds: { min: box.min.toArray(), max: box.max.toArray() }, copy: () => clone(model) };
}

function load(skin: SceneSkin): Promise<LoadedSkin | null> {
  const key = keyOf(skin);
  const known = loading.get(key);
  if (known) {
    return known;
  }
  const started = parse(skin)
    .catch(() => null)
    .then((loaded) => {
      ready.set(key, loaded);
      loading.delete(key);
      return loaded;
    });
  loading.set(key, started);
  return started;
}

function wear(holder: Group, geom: SceneGeom, skin: SceneSkin, loaded: LoadedSkin, fallback: Object3D): void {
  const placement = skinPlacement(geom, skin, loaded.bounds);
  if (!placement) {
    return;
  }
  const fitted = new Group().add(loaded.copy());
  fitted.scale.setScalar(placement.scale);
  fitted.position.set(...placement.position);
  fitted.quaternion.set(...placement.quaternion);
  holder.remove(fallback);
  holder.add(fitted);
}

// A geom that wears a model: drawn as `fallback` (its style or primitive) until the model loads, and for good when
// it cannot. A model already loaded is drawn at once, so still pictures of the scene show it too.
export function skinnedObject(geom: SceneGeom, skin: SceneSkin, fallback: Object3D): Group {
  const holder = new Group().add(fallback);
  const known = ready.get(keyOf(skin));
  if (known) {
    wear(holder, geom, skin, known, fallback);
  } else if (known === undefined) {
    void load(skin).then((loaded) => {
      if (loaded) {
        wear(holder, geom, skin, loaded, fallback);
      }
    });
  }
  return holder;
}
