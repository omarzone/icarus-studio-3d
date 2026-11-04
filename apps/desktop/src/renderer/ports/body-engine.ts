import type { EngineApi } from "../engine-client/engine-api.ts";
import type { RigApi } from "../engine-client/rig-api.ts";
import type { RobotApi } from "../engine-client/robot-api.ts";
import type { SkinApi } from "../engine-client/skin-api.ts";
import type { BodyPort, ImportPreview, ModelFile } from "./body-port.ts";
import { autoRigProgress, bodyParts, boneWeights, posePreview, rigCheckFromEngine } from "./body-views.ts";

type BodyApi = Pick<EngineApi, "project" | "library">;
type ImportApi = Pick<SkinApi, "importSkin">;
type RobotImportApi = Pick<RobotApi, "importRobot">;

export const MODEL_SUFFIXES = [".glb", ".gltf", ".obj", ".stl"] as const;

// What MOD-IMPORT can bring in (ADR 008): a mesh as a look over a fitted collider, or auto-rigged into the body.
const IMPORT: ImportPreview = {
  kinds: [
    { id: "model", label: "Model or character" },
    { id: "environment", label: "Environment" },
    { id: "robot", label: "Robot (URDF, MJCF)" },
  ],
  kind: "model",
  file: { name: "No file chosen", facts: "A .glb, .gltf, .obj or .stl model up to 15 MB", detected: "Not read yet" },
  steps: [
    "Check the model is safe to keep in the project",
    "Auto-rig: find the legs, torso and arms and place joints and motors",
    "Bind each part to its piece of the mesh, for looks only",
    "Run the physics tests before you use it",
  ],
  formats:
    "Imports .glb, .gltf, .obj and .stl meshes. Auto-rig fits a standing figure with two separate legs; anything else becomes one rigid part. FBX and USD are not supported: export them as .glb. Robots come from .urdf or MJCF .xml with their .stl or .obj meshes.",
};

// A robot brings its own joints and motors, so it skips the auto-rig and is checked as it is.
const ROBOT: Pick<ImportPreview, "file" | "steps"> = {
  file: {
    name: "No files chosen",
    facts: "A .urdf or MJCF .xml with the .stl or .obj meshes it uses, picked together",
    detected: "Not read yet",
  },
  steps: [
    "Read the robot with MuJoCo, finding each mesh among the picked files by name",
    "Turn its links, joints and motors into body parts; mesh colliders become boxes",
    "Run the physics tests before it becomes the body",
  ],
};

function chosen(file: ModelFile | null): ModelFile {
  if (!file) {
    throw new Error("Choose a .glb, .gltf, .obj or .stl model first");
  }
  return file;
}

// The body workspace on the engine: in the app the body key is the open project's id.
export function createEngineBodyPort(api: BodyApi, skins: ImportApi, rig: RigApi, robots: RobotImportApi): BodyPort {
  const kinds = new Map<string, string>();
  const preview = (body: string): ImportPreview => {
    const kind = kinds.get(body) ?? IMPORT.kind;
    return { ...IMPORT, ...(kind === "robot" ? ROBOT : {}), kind };
  };
  return {
    getRigCheck: async (body) => rigCheckFromEngine(await rig.rigCheck(body)),
    getParts: async (body) => {
      const [state, catalog] = await Promise.all([api.project(body), api.library()]);
      return bodyParts(state.project, catalog);
    },
    applyPose: async ({ body, id }) => posePreview(await rig.pose(body, { pose: id })),
    fixProblems: async (body) => rigCheckFromEngine((await rig.fixRig(body)).check),
    getWeights: async (body) => boneWeights(await rig.skinWeights(body)),
    autoFixWeights: async (body) => boneWeights(await rig.rebindSkin(body)),
    getImport: async (body) => preview(body),
    setImportKind: async ({ body, kind }) => {
      kinds.set(body, kind);
      return preview(body);
    },
    // A model stands on its own and can be pushed; an environment stays where it is put.
    importStatic: async ({ body, kind, file }) => {
      const model = chosen(file);
      if (kind === "robot") {
        throw new Error("A robot imports with its joints and motors; use Import robot");
      }
      await skins.importSkin(body, {
        name: model.name,
        data: model.data,
        mode: kind === "environment" ? "static" : "dynamic",
      });
    },
    importAndRig: async ({ body, kind, file }) => {
      const model = chosen(file);
      if (kind !== "model") {
        throw new Error("Only a model or character can be auto-rigged; import an environment as a static mesh");
      }
      await rig.startAutoRig(body, { name: model.name, data: model.data });
    },
    importRobot: async ({ body, files }) => {
      const [first, ...rest] = files.map(({ name, data }) => ({ name, data }));
      if (!first) {
        throw new Error("Choose the robot's .urdf or .xml file and its meshes first");
      }
      await robots.importRobot(body, { files: [first, ...rest] });
    },
    getAutoRig: async (body) => autoRigProgress(await rig.autoRig(body)),
    cancelAutoRig: async (body) => {
      await rig.cancelAutoRig(body);
    },
  };
}
