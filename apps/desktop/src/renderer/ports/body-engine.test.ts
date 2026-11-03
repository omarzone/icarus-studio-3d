import type { AutoRigStart, AutoRigStatus, SkinImport, SkinImported } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { createEngineBodyPort } from "./body-engine.ts";

function port() {
  const sent: { project: string; body: SkinImport }[] = [];
  const importSkin = async (project: string, body: SkinImport): Promise<SkinImported> => {
    sent.push({ project, body });
    return {
      skin: { id: "sk0123456789abcdef", name: body.name, format: "glb", size: 4, bounds: [1, 1, 1], triangles: 1 },
      object: "van",
      revision: 2,
    };
  };
  const unused = async () => {
    throw new Error("not used");
  };
  const rigged: string[] = [];
  const rig = {
    startAutoRig: async (project: string, body: AutoRigStart): Promise<AutoRigStatus> => {
      rigged.push(`${project}:${body.name}`);
      return { task_id: "t1", file: body.name, state: "running", percent: 0, steps: [] };
    },
    autoRig: unused,
    cancelAutoRig: unused,
    rigCheck: unused,
    fixRig: unused,
    pose: unused,
    skinWeights: unused,
    rebindSkin: unused,
  };
  return { sent, rigged, body: createEngineBodyPort({ project: unused, library: unused }, { importSkin }, rig) };
}

const FILE = { name: "van.glb", data: "Z2xURg==" };

describe("importing a model on the engine", () => {
  it("imports a model as a movable object and an environment as a fixed one", async () => {
    const { sent, body } = port();
    await body.importStatic({ body: "p1", kind: "model", file: FILE });
    await body.setImportKind({ body: "p1", kind: "environment" });
    const preview = await body.getImport("p1");
    await body.importStatic({ body: "p1", kind: preview.kind, file: FILE });
    expect(sent.map((item) => [item.project, item.body.name, item.body.mode])).toEqual([
      ["p1", "van.glb", "dynamic"],
      ["p1", "van.glb", "static"],
    ]);
  });

  it("asks for a file first and says robots cannot be imported yet, sending nothing", async () => {
    const { sent, body } = port();
    await expect(body.importStatic({ body: "p1", kind: "model", file: null })).rejects.toThrow(
      "Choose a .glb, .gltf, .obj",
    );
    await expect(body.importStatic({ body: "p1", kind: "robot", file: FILE })).rejects.toThrow(
      "cannot be imported yet",
    );
    expect(sent).toEqual([]);
  });
});

describe("auto-rigging on the engine", () => {
  it("sends a model or character to the auto-rig and refuses anything else", async () => {
    const { rigged, body } = port();
    await body.importAndRig({ body: "p1", kind: "model", file: { name: "person.obj", data: "dg==" } });
    await expect(body.importAndRig({ body: "p1", kind: "environment", file: FILE })).rejects.toThrow("static mesh");
    await expect(body.importAndRig({ body: "p1", kind: "model", file: null })).rejects.toThrow("Choose");
    expect(rigged).toEqual(["p1:person.obj"]);
  });
});
