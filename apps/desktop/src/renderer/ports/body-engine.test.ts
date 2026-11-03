import type { SkinImport, SkinImported } from "@icarus/contracts";
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
  return { sent, body: createEngineBodyPort({ project: unused, library: unused }, { importSkin }) };
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
    await expect(body.importStatic({ body: "p1", kind: "model", file: null })).rejects.toThrow("Choose a .glb");
    await expect(body.importStatic({ body: "p1", kind: "robot", file: FILE })).rejects.toThrow(
      "cannot be imported yet",
    );
    expect(sent).toEqual([]);
  });
});
