import type { ComponentSpec, LibraryCatalog, ObjectSpec, Project } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { isLibraryCatalog, isProject } from "../engine-client/response-checks.ts";
import { trainingVariations, variationOperations } from "./copy-variations.ts";
import parking from "./testdata/parking-car.json";

const base = (() => {
  if (!isProject(parking.project) || !isLibraryCatalog(parking.catalog)) {
    throw new Error("bad test data");
  }
  return { project: parking.project, catalog: parking.catalog };
})();

const randomizeKind: LibraryCatalog["components"][number] = {
  kind: "randomize",
  label: "Randomize per copy",
  icon: "shuffle",
  group: "Learning",
  unique: true,
  properties: [
    { id: "position_range", label: "Position range", type: "vector", default: { type: "vector", value: [0, 0, 0] } },
    { id: "rotation_range", label: "Rotation range", type: "number", default: { type: "number", value: 0 } },
    { id: "color", label: "Vary color", type: "switch", default: { type: "switch", value: false } },
    { id: "friction_spread", label: "Friction spread", type: "slider", default: { type: "slider", value: 0 } },
  ],
};
const catalog: LibraryCatalog = { ...base.catalog, components: [...base.catalog.components, randomizeKind] };

const mesh = (shape: string): ComponentSpec => ({
  id: "mesh",
  kind: "mesh",
  properties: { shape: { type: "list", value: shape }, size: { type: "vector", value: [1, 1, 1] } },
});
const randomize = (properties: ComponentSpec["properties"]): ComponentSpec => ({
  id: "randomize",
  kind: "randomize",
  properties: {
    position_range: { type: "vector", value: [0, 0, 0] },
    rotation_range: { type: "number", value: 0 },
    color: { type: "switch", value: false },
    friction_spread: { type: "slider", value: 0 },
    ...properties,
  },
});
const object = (id: string, name: string, components: ComponentSpec[]): ObjectSpec => ({
  id,
  name,
  parent: null,
  components: [{ id: "transform", kind: "transform", properties: {} }, ...components],
});

function world(objects: ObjectSpec[]): Project {
  return { ...base.project, world: { ...base.project.world, objects } };
}

const ground = object("ground", "Ground", [mesh("plane")]);
const cone = object("cone", "Cone", [mesh("cylinder")]);
const crate = object("crate", "Crate", [mesh("box")]);
const spawn = object("spawn", "Spawn point", [{ id: "spawn_point", kind: "spawn_point", properties: {} }]);

describe("training variations", () => {
  it("offers positions and colors for the world's props and grip for its ground, all off by default", () => {
    const variations = trainingVariations(world([ground, cone, crate, spawn]));
    expect(variations.map(({ id, enabled, objects }) => ({ id, enabled, objects }))).toEqual([
      { id: "positions", enabled: false, objects: ["Cone", "Crate"] },
      { id: "colors", enabled: false, objects: ["Cone", "Crate"] },
      { id: "grip", enabled: false, objects: ["Ground"] },
    ]);
  });

  it("is on when an object already varies, names only the objects that do and shows their range", () => {
    const moving = {
      ...cone,
      components: [...cone.components, randomize({ position_range: { type: "vector", value: [1.5, 0.5, 0] } })],
    };
    const gripping = {
      ...ground,
      components: [...ground.components, randomize({ friction_spread: { type: "slider", value: 10 } })],
    };
    const variations = trainingVariations(world([gripping, moving, crate]));
    expect(variations.find((item) => item.id === "positions")).toMatchObject({
      enabled: true,
      detail: "± 1.5 m",
      objects: ["Cone"],
    });
    expect(variations.find((item) => item.id === "grip")).toMatchObject({ enabled: true, detail: "± 10%" });
    expect(variations.find((item) => item.id === "colors")?.enabled).toBe(false);
  });

  it("leaves out what the world has nothing to vary for", () => {
    expect(trainingVariations(world([spawn]))).toEqual([]);
    expect(trainingVariations(world([ground])).map((item) => item.id)).toEqual(["grip"]);
  });
});

describe("variation operations", () => {
  it("adds a Randomize component to every prop that has none, with the library defaults and the variation on", () => {
    const operations = variationOperations(world([ground, cone]), catalog, "colors");
    expect(operations).toEqual([
      {
        op: "add_component",
        object: "cone",
        component: {
          id: "randomize",
          kind: "randomize",
          properties: {
            position_range: { type: "vector", value: [0, 0, 0] },
            rotation_range: { type: "number", value: 0 },
            color: { type: "switch", value: true },
            friction_spread: { type: "slider", value: 0 },
          },
        },
      },
    ]);
  });

  it("changes the existing Randomize component instead of adding a second one", () => {
    const varied = {
      ...crate,
      components: [...crate.components, randomize({ color: { type: "switch", value: true } })],
    };
    const operations = variationOperations(world([varied]), catalog, "positions");
    expect(operations).toEqual([
      {
        op: "set_property",
        object: "crate",
        component: "randomize",
        property: "position_range",
        value: { type: "vector", value: [1, 1, 0] },
      },
      {
        op: "set_property",
        object: "crate",
        component: "randomize",
        property: "rotation_range",
        value: { type: "number", value: 15 },
      },
    ]);
  });

  it("turns a variation off everywhere it is on, and only there", () => {
    const gripping = {
      ...ground,
      components: [...ground.components, randomize({ friction_spread: { type: "slider", value: 10 } })],
    };
    const operations = variationOperations(world([gripping, cone]), catalog, "grip");
    expect(operations).toEqual([
      {
        op: "set_property",
        object: "ground",
        component: "randomize",
        property: "friction_spread",
        value: { type: "slider", value: 0 },
      },
    ]);
  });

  it("refuses when the engine's library has no Randomize component", () => {
    expect(() => variationOperations(world([cone]), base.catalog, "colors")).toThrow(/Randomize/);
  });

  it("refuses an unknown variation", () => {
    expect(() => variationOperations(world([cone]), catalog, "wind")).toThrow(/wind/);
  });
});
