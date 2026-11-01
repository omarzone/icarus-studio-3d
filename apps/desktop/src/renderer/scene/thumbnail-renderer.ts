import type { SceneDescription, SceneGeom } from "@icarus/contracts";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  type BufferGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  WebGLRenderer,
} from "three";
import { toThreePosition, toThreeQuaternion } from "./coordinates.ts";
import { geomShape } from "./geom-shape.ts";
import { AMBIENT_INTENSITY, floorDepth, GEOM_ROUGHNESS, sceneColors, sceneLight } from "./scene-materials.ts";
import { sceneBounds, thumbnailCamera } from "./thumbnail-framing.ts";

const WIDTH = 720;
const HEIGHT = 360;

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
  created.setPixelRatio(1);
  created.setSize(WIDTH, HEIGHT, false);
  shared = created;
  return created;
}

function geometry(geom: SceneGeom): BufferGeometry {
  const shape = geomShape(geom);
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
}

// Draws the engine's compiled scene at its initial pose from a fixed three-quarter view, as a PNG data URL.
export function renderSceneThumbnail(description: SceneDescription): string {
  const colors = sceneColors();
  const scene = new Scene();
  scene.background = new Color(colors.background);
  scene.add(new AmbientLight(0xffffff, AMBIENT_INTENSITY));
  for (const light of description.lights) {
    const { position, intensity } = sceneLight(light);
    const directional = new DirectionalLight(0xffffff, intensity);
    directional.position.set(...position);
    scene.add(directional);
  }
  const meshes = description.geoms.map((geom) => {
    const mesh = new Mesh(
      geometry(geom),
      new MeshStandardMaterial({ color: geom.color, roughness: GEOM_ROUGHNESS, ...floorDepth(geom.shape) }),
    );
    mesh.position.set(...toThreePosition(geom.position));
    mesh.quaternion.set(...toThreeQuaternion(geom.quaternion));
    scene.add(mesh);
    return mesh;
  });
  const framing = thumbnailCamera(sceneBounds(description.geoms), WIDTH / HEIGHT);
  const camera = new PerspectiveCamera(framing.fov, WIDTH / HEIGHT, framing.near, framing.far);
  camera.position.set(...framing.position);
  camera.lookAt(...framing.target);
  try {
    const gl = renderer();
    gl.render(scene, camera);
    return gl.domElement.toDataURL("image/png");
  } finally {
    for (const mesh of meshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}
