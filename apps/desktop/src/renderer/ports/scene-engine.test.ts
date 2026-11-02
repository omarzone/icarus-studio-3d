import type { EditOperation, LibraryCatalog, Project, ProjectState } from "@icarus/contracts";
import { describe, expect, it, vi } from "vitest";
import type { EngineApi } from "../engine-client/engine-api.ts";
import { EngineRejected } from "../engine-client/request.ts";
import { isLibraryCatalog, isProject } from "../engine-client/response-checks.ts";
import { createEngineScenePort, nextComponentId, worldToParent } from "./scene-engine.ts";
import parking from "./testdata/parking-car.json";

const { project, catalog } = (() => {
  if (!isProject(parking.project) || !isLibraryCatalog(parking.catalog)) {
    throw new Error("bad test data");
  }
  return { project: parking.project, catalog: parking.catalog };
})();

function stateOf(doc: Project, number = 1): ProjectState {
  return {
    project: doc,
    revision: {
      number,
      parent: null,
      author: "user",
      summary: "s",
      operations: [],
      created_at: "",
      restored_from: null,
    },
    report: { ok: true, checks: [], duration_ms: 1 },
    can_undo: number > 1,
    can_redo: false,
  };
}

function fakeApi(apply: (operations: EditOperation[]) => Promise<ProjectState>) {
  const applyOperations = vi.fn((_id: string, operations: EditOperation[]) => apply(operations));
  const api: Pick<EngineApi, "project" | "library" | "applyOperations" | "scene"> = {
    project: async () => stateOf(project),
    scene: async () => ({ revision: 1, bodies: [], geoms: [], lights: [] }),
    library: async (): Promise<LibraryCatalog> => catalog,
    applyOperations,
  };
  return { api, applyOperations };
}

describe("engine scene port", () => {
  it("sends one set_property for the selected object and shows the engine's answer", async () => {
    const changed = structuredClone(project);
    const collider = changed.bodies[0]?.objects[0]?.components.find((item) => item.kind === "collider");
    if (collider) {
      collider.properties.friction = { type: "slider", value: 1.5 };
    }
    const { api, applyOperations } = fakeApi(async () => stateOf(changed, 2));
    const port = createEngineScenePort(api);
    await port.selectObject({ scene: project.id, id: "car" });
    const view = await port.setProperty({
      scene: project.id,
      section: "collider",
      property: "friction",
      value: { type: "slider", value: 1.5, min: 0, max: 2, step: 0.05 },
    });
    expect(applyOperations).toHaveBeenCalledTimes(1);
    expect(applyOperations.mock.calls[0]?.[1]).toEqual([
      {
        op: "set_property",
        object: "car",
        component: "collider",
        property: "friction",
        value: { type: "slider", value: 1.5 },
      },
    ]);
    const friction = view.kind === "object" ? view.sections.find((s) => s.id === "collider")?.properties[0] : undefined;
    expect(friction).toMatchObject({ value: 1.5, state: "changed" });
  });

  it("keeps the selection when the engine rejects an edit", async () => {
    const { api } = fakeApi(async () => {
      throw new EngineRejected("No", [{ path: "objects.car.components.physics_body.mass", message: "Too heavy" }]);
    });
    const port = createEngineScenePort(api);
    await port.selectObject({ scene: project.id, id: "car" });
    await expect(
      port.setProperty({
        scene: project.id,
        section: "physics_body",
        property: "mass",
        value: { type: "number", value: -1 },
      }),
    ).rejects.toBeInstanceOf(EngineRejected);
    expect((await port.getTree(project.id)).selected).toBe("car");
  });
});

it("names a new component after its kind, numbering repeats", () => {
  expect(nextComponentId(["transform", "mesh"], "touch")).toBe("touch");
  expect(nextComponentId(["touch", "touch_2"], "touch")).toBe("touch_3");
});

it("moves an object by a world delta expressed in its parent's frame", () => {
  // Parent turned 90° about z: a world +x move is a local −y move.
  const half = Math.SQRT1_2;
  const local = worldToParent([1, 0, 0], [half, 0, 0, half]);
  expect(local[0]).toBeCloseTo(0, 6);
  expect(local[1]).toBeCloseTo(-1, 6);
  expect(local[2]).toBeCloseTo(0, 6);
});
