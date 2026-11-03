import type { EditOperation, LibraryCatalog, Project } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { isLibraryCatalog, isProject } from "../engine-client/response-checks.ts";
import {
  addRayOperation,
  addTermOperation,
  learningView,
  rayDirection,
  removeInputOperation,
  renameInputOperation,
  rewardOptions,
  sensesActions,
  toggleOperation,
  weightOperation,
} from "./brain-views.ts";
import parking from "./testdata/parking-car.json";

const { project, catalog } = (() => {
  if (!isProject(parking.project) || !isLibraryCatalog(parking.catalog)) {
    throw new Error("bad test data");
  }
  return { project: parking.project, catalog: parking.catalog };
})();

// The library as it is now: distance rays carry a name and a heading.
const library: LibraryCatalog = catalog;
const named: LibraryCatalog = {
  ...library,
  components: library.components.map((kind) =>
    kind.kind === "distance_ray"
      ? {
          ...kind,
          unique: false,
          properties: [
            { id: "name", label: "Name", type: "text", default: { type: "text", value: "" } },
            { id: "heading", label: "Heading", type: "number", unit: "°", default: { type: "number", value: 0 } },
            ...kind.properties,
          ],
        }
      : kind,
  ),
};

function withOperation(doc: Project, operation: EditOperation): Project {
  if (operation.op !== "add_component") {
    throw new Error("only adding is replayed here");
  }
  const bodies = doc.bodies.map((body) => ({
    ...body,
    objects: body.objects.map((obj) =>
      obj.id === operation.object ? { ...obj, components: [...obj.components, operation.component] } : obj,
    ),
  }));
  return { ...doc, bodies };
}

describe("sensesActions", () => {
  it("maps body sensors to inputs and motors to outputs", () => {
    const view = sensesActions(project, catalog);
    expect(view.inputs).toEqual([
      {
        id: "car/distance_ray",
        name: "Car distance",
        detail: "Car · 5 rays · 10 m · ahead",
        enabled: true,
        renamable: false,
        removable: true,
      },
    ]);
    expect(view.outputs.map((output) => output.name)).toEqual([
      "Front left steering",
      "Rear left wheel",
      "Front right steering",
      "Rear right wheel",
    ]);
    expect(view.outputs[1]).toEqual({
      id: "wheel_rear_left/motor",
      name: "Rear left wheel",
      detail: "Torque · up to 400 N",
      enabled: true,
    });
  });

  it("turns senses and motors off through the whole list the brain leaves out, keeping one motor on", () => {
    const off = toggleOperation(project, "senses", "car/distance_ray");
    expect(off).toEqual({ op: "set_brain", muted_senses: ["car/distance_ray"] });
    const motors = ["steer_left/motor", "wheel_rear_left/motor", "steer_right/motor"];
    const muted = { ...project, brain: { ...project.brain, muted_senses: ["car/distance_ray"], muted_motors: motors } };
    expect(toggleOperation(muted, "senses", "car/distance_ray")).toEqual({ op: "set_brain", muted_senses: [] });
    const view = sensesActions(muted, catalog);
    expect(view.inputs[0]?.enabled).toBe(false);
    expect(view.outputs.map((output) => [output.enabled, output.lockedReason !== undefined])).toEqual([
      [false, false],
      [false, false],
      [false, false],
      [true, true],
    ]);
  });

  it("names a second, added ray on its own and offers renaming when the library has ray names", () => {
    const operation = addRayOperation(project, named);
    expect(operation).toMatchObject({
      op: "add_component",
      object: "car",
      component: {
        id: "distance_ray_2",
        kind: "distance_ray",
        properties: { name: { type: "text", value: "Ray 2" }, count: { type: "count", value: 1 } },
      },
    });
    const inputs = sensesActions(withOperation(project, operation), named).inputs;
    expect(inputs.map((input) => [input.id, input.name, input.detail, input.renamable])).toEqual([
      ["car/distance_ray", "Car distance", "Car · 5 rays · 10 m · ahead", true],
      ["car/distance_ray_2", "Ray 2", "Car · 1 ray · 5 m · ahead", true],
    ]);
  });
});

describe("sensor operations", () => {
  it("renames a ray through its name property, trimmed, and removes it through its component", () => {
    expect(renameInputOperation(project, "car/distance_ray", "  Front  ")).toEqual({
      op: "set_property",
      object: "car",
      component: "distance_ray",
      property: "name",
      value: { type: "text", value: "Front" },
    });
    expect(removeInputOperation(project, "car/distance_ray")).toEqual({
      op: "remove_component",
      object: "car",
      component: "distance_ray",
    });
  });

  it("refuses a sensor that is no longer on the body", () => {
    expect(() => removeInputOperation(project, "car/gone")).toThrow("no longer on the body");
  });

  it("says where rays point the way the engine names them", () => {
    expect([0, 30, -15, 180, -180, 390].map(rayDirection)).toEqual([
      "ahead",
      "30° left",
      "15° right",
      "behind",
      "behind",
      "30° left",
    ]);
  });
});

describe("learningView", () => {
  it("lists the task rewards with library labels, kinds and slider scales", () => {
    const view = learningView(project, catalog);
    expect(view.reward.map((term) => [term.id, term.name, term.weight, term.scale, term.kind])).toEqual([
      ["reach_goal", catalog.reward_terms[0]?.label, 10, 100, "goal"],
      ["progress_to_goal", catalog.reward_terms[1]?.label, 1, 10, "goal"],
      ["collision_penalty", catalog.reward_terms[3]?.label, -5, 50, "penalty"],
      ["time_penalty", catalog.reward_terms[4]?.label, -0.01, 1, "cost"],
    ]);
    expect(view.goal.endsWhen).toEqual(["It reaches the goal", "It falls", "Time runs out"]);
    expect(view.curriculum).toEqual([]);
    expect(view.proposedChanges).toBe(0);
  });
});

describe("weightOperation", () => {
  it("sets the term again with the new weight clamped to the library range, keeping its params", () => {
    expect(weightOperation(project, catalog, "collision_penalty", -80)).toEqual({
      op: "set_reward_term",
      term: { term: "collision_penalty", weight: -50, params: {} },
    });
  });

  it("refuses a term the task does not have", () => {
    expect(() => weightOperation(project, catalog, "fall_penalty", -1)).toThrow();
  });
});

describe("rewardOptions", () => {
  it("offers terms that fit the task family and are not used yet", () => {
    expect(rewardOptions(project, catalog).map((option) => option.term)).toEqual(["heading_alignment"]);
  });

  it("uses the families list when the library gives it", () => {
    const base: LibraryCatalog = catalog;
    const shared: LibraryCatalog["reward_terms"] = base.reward_terms.map((info) =>
      info.term === "energy_cost" ? { ...info, families: ["locomotion", "navigation"] } : info,
    );
    const lib: LibraryCatalog = { ...base, reward_terms: shared };
    expect(rewardOptions(project, lib).map((option) => option.term)).toEqual(["heading_alignment", "energy_cost"]);
  });
});

describe("addTermOperation", () => {
  it("adds a fitting term at its default weight", () => {
    expect(addTermOperation(project, catalog, "heading_alignment")).toEqual({
      op: "set_reward_term",
      term: { term: "heading_alignment", weight: 0.2, params: {} },
    });
  });

  it("refuses a term from another family", () => {
    expect(() => addTermOperation(project, catalog, "fall_penalty")).toThrow();
  });
});
