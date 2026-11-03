import type { EngineApi } from "../engine-client/engine-api.ts";
import type { SkinApi } from "../engine-client/skin-api.ts";
import type { BodyPort, ImportPreview } from "./body-port.ts";
import { bodyParts, rigCheckFromReport } from "./body-views.ts";

type BodyApi = Pick<EngineApi, "project" | "library">;
type ImportApi = Pick<SkinApi, "importSkin">;

// What MOD-IMPORT can bring in today (ADR 008): a glTF or GLB model, drawn over a collider fitted to it.
const IMPORT: ImportPreview = {
  kinds: [
    { id: "model", label: "Model or character" },
    { id: "environment", label: "Environment" },
    { id: "robot", label: "Robot (URDF, MJCF)" },
  ],
  kind: "model",
  file: { name: "No file chosen", facts: "A .glb or .gltf model up to 15 MB", detected: "Not read yet" },
  steps: [
    "Check the model is safe to keep in the project",
    "Fit a collider around it",
    "Estimate its mass from its size",
    "Run a physics check before you use it",
  ],
  formats:
    "Imports .glb and .gltf models with embedded textures. FBX, OBJ and USD are not supported yet: export them as .glb. Robots from URDF or MJCF are not supported yet.",
};

// The body workspace on the engine: in the app the body key is the open project's id.
export function createEngineBodyPort(
  api: BodyApi,
  skins: ImportApi,
): Pick<BodyPort, "getRigCheck" | "getParts" | "getImport" | "setImportKind" | "importStatic"> {
  const kinds = new Map<string, string>();
  const preview = (body: string): ImportPreview => ({ ...IMPORT, kind: kinds.get(body) ?? IMPORT.kind });
  return {
    getRigCheck: async (body) => rigCheckFromReport((await api.project(body)).report),
    getParts: async (body) => {
      const [state, catalog] = await Promise.all([api.project(body), api.library()]);
      return bodyParts(state.project, catalog);
    },
    getImport: async (body) => preview(body),
    setImportKind: async ({ body, kind }) => {
      kinds.set(body, kind);
      return preview(body);
    },
    // A model stands on its own and can be pushed; an environment stays where it is put.
    importStatic: async ({ body, kind, file }) => {
      if (!file) {
        throw new Error("Choose a .glb or .gltf model first");
      }
      if (kind === "robot") {
        throw new Error("Robots from URDF or MJCF cannot be imported yet; import the robot's look as a model");
      }
      await skins.importSkin(body, {
        name: file.name,
        data: file.data,
        mode: kind === "environment" ? "static" : "dynamic",
      });
    },
  };
}
