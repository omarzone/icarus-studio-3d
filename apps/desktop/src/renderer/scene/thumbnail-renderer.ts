import type { SceneDescription } from "@icarus/contracts";
import {
  ACESFilmicToneMapping,
  Color,
  FogExp2,
  HemisphereLight,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { geomObject } from "./geom-object.ts";
import { groundColor, hemisphereLook, sunFrame } from "./scene-lighting.ts";
import { AMBIENT_INTENSITY, sceneColors } from "./scene-materials.ts";
import { skyLook } from "./scene-sky.ts";
import { createSkyDome } from "./sky-dome.ts";
import { sunLight } from "./sun-light.ts";
import { sceneBounds, thumbnailCamera, topCamera } from "./thumbnail-framing.ts";
import { zoneMesh } from "./zone-mesh.ts";

const WIDTH = 720;
const HEIGHT = 360;
// Share of the camera's far distance the sky dome reaches, so the dome is never clipped.
const DOME_REACH = 0.9;

// One WebGL context for every card: browsers allow only a handful, and a page can show many cards.
let shared: WebGLRenderer | null = null;

function renderer(): WebGLRenderer {
  if (shared && !shared.getContext().isContextLost()) {
    return shared;
  }
  shared?.dispose();
  const created = new WebGLRenderer({
    canvas: document.createElement("canvas"),
    antialias: true,
    preserveDrawingBuffer: true,
  });
  // The same output as the editor viewport, which React Three Fiber renders with this tone mapping.
  created.toneMapping = ACESFilmicToneMapping;
  created.shadowMap.enabled = true;
  created.shadowMap.type = PCFShadowMap;
  created.setPixelRatio(1);
  created.setSize(WIDTH, HEIGHT, false);
  shared = created;
  return created;
}

// Draws the engine's compiled scene at its initial pose from a fixed three-quarter view, as a PNG data URL.
export function renderSceneThumbnail(description: SceneDescription): string {
  return renderSceneView(description, { view: "three-quarter", width: WIDTH, height: HEIGHT, type: "image/png" });
}

export type SceneViewOptions = {
  view: "three-quarter" | "top";
  width: number;
  height: number;
  type: "image/png" | "image/jpeg";
};

// The same still picture from a chosen side and size, as a data URL (the copilot's look at the scene).
export function renderSceneView(description: SceneDescription, options: SceneViewOptions): string {
  const { width, height } = options;
  const colors = sceneColors();
  const look = skyLook(description.sky);
  const scene = new Scene();
  scene.background = new Color(look?.horizon ?? colors.background);
  const hemisphere = hemisphereLook(look, groundColor(description.geoms, colors.background), AMBIENT_INTENSITY);
  scene.add(new HemisphereLight(hemisphere.sky, hemisphere.ground, hemisphere.intensity));
  const frame = options.view === "top" ? topCamera : thumbnailCamera;
  const bounds = sceneBounds(description.geoms);
  const framing = frame(bounds, width / height);
  const dome = look ? createSkyDome(look, framing.far * DOME_REACH) : null;
  if (dome) {
    dome.position.set(...framing.target);
    scene.add(dome);
  }
  if (look?.fog) {
    scene.fog = new FogExp2(look.fog.color, look.fog.density);
  }
  const suns = description.lights.map((light, index) => {
    const sun = sunLight(sunFrame(light, bounds), index === 0);
    scene.add(sun, sun.target);
    return sun;
  });
  // The same objects the viewport draws, styles included; their geometries and materials are shared, never disposed.
  for (const geom of description.geoms) {
    scene.add(geomObject(geom));
  }
  // Where the task starts and ends, as the viewport paints it, so a parking card shows where it parks.
  const zoneColors = { goal: colors.goal, spawn: colors.spawn, area: colors.goal };
  const zones = (description.zones ?? []).map((zone) => {
    const mesh = zoneMesh(zone, zoneColors);
    scene.add(mesh);
    return mesh;
  });
  const camera = new PerspectiveCamera(framing.fov, width / height, framing.near, framing.far);
  camera.position.set(...framing.position);
  camera.lookAt(...framing.target);
  try {
    const gl = renderer();
    gl.setSize(width, height, false);
    gl.render(scene, camera);
    return gl.domElement.toDataURL(options.type, 0.85);
  } finally {
    dome?.geometry.dispose();
    dome?.material.dispose();
    for (const sun of suns) {
      sun.dispose();
    }
    for (const mesh of zones) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}
