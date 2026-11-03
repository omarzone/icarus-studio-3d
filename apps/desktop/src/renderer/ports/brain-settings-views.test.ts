import type { Project } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { isLibraryCatalog, isProject } from "../engine-client/response-checks.ts";
import { brainInspection, brainSettingOperation, brainSettingReset } from "./brain-settings-views.ts";
import type { Property } from "./scene-port.ts";
import parking from "./testdata/parking-car.json";

const { project, catalog } = (() => {
  if (!isProject(parking.project) || !isLibraryCatalog(parking.catalog)) {
    throw new Error("bad test data");
  }
  return { project: parking.project, catalog: parking.catalog };
})();

function withBrain(brain: Partial<Project["brain"]>): Project {
  return { ...project, brain: { ...project.brain, ...brain } };
}

function propertyOf(target: Project, id: string): Property {
  const inspection = brainInspection(target, catalog);
  if (inspection.kind !== "object") {
    throw new Error("no brain settings");
  }
  const found = inspection.sections.flatMap((section) => section.properties).find((item) => item.id === id);
  if (!found) {
    throw new Error(`no ${id}`);
  }
  return found;
}

describe("brainInspection", () => {
  it("shows practice first and folds the expert settings away", () => {
    const inspection = brainInspection(project, catalog);
    if (inspection.kind !== "object") {
      throw new Error("no brain settings");
    }
    expect(inspection.sections.map((section) => [section.title, section.collapsed])).toEqual([
      ["Practice", false],
      ["Expert settings", true],
    ]);
    expect(inspection.sections[0]?.properties.map((item) => item.label)).toEqual(["Steps", "Parallel copies"]);
    expect(inspection.components).toBe(false);
  });

  it("shows the task's recommended steps as auto until the brain has its own", () => {
    expect(propertyOf(project, "training_steps")).toMatchObject({ type: "number", value: 1_000_000, auto: true });
    expect(propertyOf(withBrain({ training_steps: 300_000 }), "training_steps")).toMatchObject({
      value: 300_000,
      state: "changed",
    });
  });

  it("reads the network and PPO settings, with defaults for brains saved before they existed", () => {
    expect(propertyOf(project, "layers")).toMatchObject({ type: "count", value: 2, state: "default" });
    expect(propertyOf(project, "ppo.learning_rate")).toMatchObject({ value: 0.0003, state: "default" });
    const tuned = withBrain({ layers: [64, 64, 64], ppo: { learning_rate: 0.001 } });
    expect(propertyOf(tuned, "layers")).toMatchObject({ value: 3, state: "changed", was: "2" });
    expect(propertyOf(tuned, "neurons")).toMatchObject({ value: 64, state: "changed" });
    expect(propertyOf(tuned, "ppo.learning_rate")).toMatchObject({ value: 0.001, state: "changed" });
    expect(propertyOf(withBrain({ layers: [128, 32] }), "neurons")).toMatchObject({ state: "mixed", note: "128, 32" });
  });
});

describe("brainSettingOperation", () => {
  it("turns each setting into the set_brain field it names", () => {
    const number = (value: number) => ({ type: "number", value }) as const;
    expect(brainSettingOperation(project, catalog, "training_steps", number(500_000))).toEqual({
      op: "set_brain",
      training_steps: 500_000,
    });
    expect(brainSettingOperation(project, catalog, "ppo.gamma", number(0.95))).toEqual({
      op: "set_brain",
      ppo: { gamma: 0.95 },
    });
    expect(
      brainSettingOperation(project, catalog, "neurons", { type: "slider", value: 64, min: 8, max: 1024, step: 8 }),
    ).toEqual({ op: "set_brain", layers: [64, 64] });
  });

  it("keeps existing layer sizes when the layer count changes", () => {
    const shaped = withBrain({ layers: [128, 64] });
    const count = (value: number) => ({ type: "count", value, min: 1, max: 4 }) as const;
    expect(brainSettingOperation(shaped, catalog, "layers", count(3))).toEqual({
      op: "set_brain",
      layers: [128, 64, 64],
    });
    expect(brainSettingOperation(shaped, catalog, "layers", count(1))).toEqual({ op: "set_brain", layers: [128] });
  });

  it("refuses methods that do not train and settings the library does not have", () => {
    const sac = { type: "list", value: "sac", options: [] } as const;
    expect(() => brainSettingOperation(project, catalog, "algorithm", sac)).toThrow("PPO is the only method");
    expect(() => brainSettingOperation(project, catalog, "dropout", { type: "number", value: 1 })).toThrow();
  });

  it("resets steps to the task's recommendation and the rest to the library default", () => {
    expect(brainSettingReset(project, catalog, "training_steps")).toEqual({
      op: "set_brain",
      training_steps: "recommended",
    });
    expect(brainSettingReset(project, catalog, "ppo.learning_rate")).toEqual({
      op: "set_brain",
      ppo: { learning_rate: 0.0003 },
    });
  });
});
