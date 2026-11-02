import type { LibraryCatalog } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { isLibraryCatalog, isProject } from "../engine-client/response-checks.ts";
import { addTermOperation, learningView, rewardOptions, sensesActions, weightOperation } from "./brain-views.ts";
import parking from "./testdata/parking-car.json";

const { project, catalog } = (() => {
  if (!isProject(parking.project) || !isLibraryCatalog(parking.catalog)) {
    throw new Error("bad test data");
  }
  return { project: parking.project, catalog: parking.catalog };
})();

describe("sensesActions", () => {
  it("maps body sensors to inputs and motors to outputs", () => {
    const view = sensesActions(project, catalog);
    expect(view.inputs).toEqual([
      { id: "car/distance_ray", name: "Distance ray", detail: "Car · 5 rays · 10 m", enabled: true },
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
