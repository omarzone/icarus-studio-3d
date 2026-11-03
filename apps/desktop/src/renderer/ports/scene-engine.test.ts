import type {
  Conversation,
  CopilotProposal,
  EditOperation,
  LibraryCatalog,
  Project,
  ProjectState,
} from "@icarus/contracts";
import { describe, expect, it, vi } from "vitest";
import type { CopiesApi, EngineApi } from "../engine-client/engine-api.ts";
import { EngineRejected } from "../engine-client/request.ts";
import { isLibraryCatalog, isProject } from "../engine-client/response-checks.ts";
import { createEngineScenePort, nextComponentId } from "./scene-engine.ts";
import type { Inspection } from "./scene-port.ts";
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

function conversationWith(proposals: CopilotProposal[]): Conversation {
  return { project_id: project.id, messages: [], proposals, autonomy: "ask", suggestions: [], suggestion_items: [] };
}

function proposalOf(operations: CopilotProposal["operations"], base_revision = 1): CopilotProposal {
  return {
    id: `${project.id}-p1`,
    project_id: project.id,
    base_revision,
    summary: "Grippier tyres",
    explanation: "",
    operations,
    changes: [],
    warnings: [],
    status: "open",
  };
}

type FakeApi = Pick<EngineApi, "project" | "library" | "applyOperations" | "scene" | "runs"> &
  Pick<EngineApi, "conversation" | "applyProposal"> &
  CopiesApi;

function fakeApi(apply: (operations: EditOperation[]) => Promise<ProjectState>, proposals: CopilotProposal[] = []) {
  let current = stateOf(project);
  const applyOperations = vi.fn(async (_id: string, operations: EditOperation[], _summary?: string) => {
    current = await apply(operations);
    return current;
  });
  const applyProposal = vi.fn(async (id: string) => {
    const found = proposals.find((item) => item.id === id);
    current = await apply(found?.operations ?? []);
    return conversationWith([]);
  });
  const api: FakeApi = {
    project: async () => current,
    scene: async () => ({ revision: 1, bodies: [], geoms: [], lights: [] }),
    library: async (): Promise<LibraryCatalog> => catalog,
    applyOperations,
    conversation: async () => conversationWith(proposals),
    applyProposal,
    copyScenes: async () => [],
    runs: async () => [],
  };
  return { api, applyOperations, applyProposal };
}

const GRIP: EditOperation = {
  op: "set_property",
  object: "car",
  component: "collider",
  property: "friction",
  value: { type: "slider", value: 1.5 },
};

function withGrip(): Project {
  const changed = structuredClone(project);
  const collider = changed.bodies[0]?.objects[0]?.components.find((item) => item.kind === "collider");
  if (collider) {
    collider.properties.friction = { type: "slider", value: 1.5 };
  }
  return changed;
}

function frictionOf(view: Inspection) {
  return view.kind === "object"
    ? view.sections.find((s) => s.id === "collider")?.properties.find((p) => p.id === "friction")
    : undefined;
}

describe("copilot proposed values in the inspector", () => {
  it("shows the open proposal's value and accepts it by applying the proposal", async () => {
    const { api, applyOperations, applyProposal } = fakeApi(async () => stateOf(withGrip(), 2), [proposalOf([GRIP])]);
    const port = createEngineScenePort(api);
    await port.selectObject({ scene: project.id, id: "car" });
    const shown = frictionOf(await port.getInspection(project.id));
    expect(shown).toMatchObject({ state: "proposed", proposed: { type: "slider", value: 1.5 } });
    const after = await port.acceptProposedValue({ scene: project.id, section: "collider", property: "friction" });
    expect(applyProposal).toHaveBeenCalledWith(`${project.id}-p1`);
    expect(applyOperations).not.toHaveBeenCalled();
    expect(frictionOf(after)).toMatchObject({ value: 1.5, state: "changed" });
  });

  it("applies only the accepted operation of a proposal that changes more", async () => {
    const other: EditOperation = { op: "rename_object", object: "goal", name: "Spot" };
    const { api, applyOperations, applyProposal } = fakeApi(
      async () => stateOf(withGrip(), 2),
      [proposalOf([GRIP, other])],
    );
    const port = createEngineScenePort(api);
    await port.selectObject({ scene: project.id, id: "car" });
    await port.acceptProposedValue({ scene: project.id, section: "collider", property: "friction" });
    expect(applyProposal).not.toHaveBeenCalled();
    expect(applyOperations.mock.calls[0]?.[1]).toEqual([GRIP]);
  });

  it("shows nothing proposed and refuses to accept once the project moved past the proposal", async () => {
    const { api, applyOperations, applyProposal } = fakeApi(async () => stateOf(project, 2), [proposalOf([GRIP], 3)]);
    const port = createEngineScenePort(api);
    await port.selectObject({ scene: project.id, id: "car" });
    expect(frictionOf(await port.getInspection(project.id))?.state).not.toBe("proposed");
    await expect(
      port.acceptProposedValue({ scene: project.id, section: "collider", property: "friction" }),
    ).rejects.toThrow(/no longer proposes/);
    expect(applyOperations).not.toHaveBeenCalled();
    expect(applyProposal).not.toHaveBeenCalled();
  });

  it("proposes and accepts a brain setting from a set_brain operation", async () => {
    const more: EditOperation = { op: "set_brain", copies: 32 };
    const trained = { ...project, brain: { ...project.brain, copies: 32 } };
    const { api, applyProposal } = fakeApi(async () => stateOf(trained, 2), [proposalOf([more])]);
    const port = createEngineScenePort(api);
    const copiesOf = (view: Inspection) =>
      view.kind === "object" ? view.sections.flatMap((s) => s.properties).find((p) => p.id === "copies") : undefined;
    expect(copiesOf(await port.getBrainSettings(project.id))).toMatchObject({
      state: "proposed",
      proposed: { value: 32 },
    });
    const after = await port.acceptProposedValue({ scene: project.id, section: "practice", property: "copies" });
    expect(applyProposal).toHaveBeenCalledTimes(1);
    expect(copiesOf(after)).toMatchObject({ value: 32 });
  });
});

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

  it("turns and stretches an object through set_property on its Transform", async () => {
    const { api, applyOperations } = fakeApi(async () => stateOf(project, 2));
    const port = createEngineScenePort(api);
    const half = Math.SQRT1_2;
    await port.rotateObject({ scene: project.id, id: "car", delta: [half, 0, 0, half] });
    await port.scaleObject({ scene: project.id, id: "car", factor: [2, 1, 0.5] });
    const sent = applyOperations.mock.calls.map((call) => call[1]);
    expect(sent).toEqual([
      [{ op: "set_property", object: "car", component: "transform", property: "rotation", value: vector(0, 0, 90) }],
      [{ op: "set_property", object: "car", component: "transform", property: "scale", value: vector(2, 1, 0.5) }],
    ]);
  });

  it("renames with the trimmed name and refuses an empty one before asking the engine", async () => {
    const { api, applyOperations } = fakeApi(async () => stateOf(project, 2));
    const port = createEngineScenePort(api);
    await port.renameObject({ scene: project.id, id: "goal", name: "  Spot  " });
    await expect(port.renameObject({ scene: project.id, id: "goal", name: " " })).rejects.toThrow(/empty/);
    expect(applyOperations).toHaveBeenCalledTimes(1);
    expect(applyOperations.mock.calls[0]?.[1]).toEqual([{ op: "rename_object", object: "goal", name: "Spot" }]);
    expect(applyOperations.mock.calls[0]?.[2]).toBe("Renamed Parking spot to Spot");
  });
});

function vector(x: number, y: number, z: number) {
  return { type: "vector", value: [x, y, z] };
}

it("names a new component after its kind, numbering repeats", () => {
  expect(nextComponentId(["transform", "mesh"], "touch")).toBe("touch");
  expect(nextComponentId(["touch", "touch_2"], "touch")).toBe("touch_3");
});
