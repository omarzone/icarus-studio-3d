import type { LibraryCatalog, Project, PropertySchema, PropertyValue } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { isLibraryCatalog, isProject } from "../engine-client/response-checks.ts";
import type { Inspection } from "./scene-port.ts";
import { componentGroups, inspection, sceneTree, toContractValue, toViewValue } from "./scene-views.ts";
import parking from "./testdata/parking-car.json";

function load(): { project: Project; catalog: LibraryCatalog } {
  const { project, catalog } = parking;
  if (!isProject(project) || !isLibraryCatalog(catalog)) {
    throw new Error("The parking car test data does not match the contract");
  }
  return { project, catalog };
}

const { project, catalog } = load();

function sections(view: Inspection) {
  return view.kind === "object" ? view.sections : [];
}

describe("sceneTree", () => {
  it("lists the world and the car body with wheels nested under the car", () => {
    const tree = sceneTree(project, catalog, null);
    expect(tree.sections.map((section) => section.label)).toEqual(["World", "Car"]);
    const car = tree.sections[1]?.objects ?? [];
    expect(car[0]).toMatchObject({ id: "car", name: "Car", depth: 0, icon: "agent" });
    expect(car.find((item) => item.id === "wheel_rear_left")?.depth).toBe(1);
    expect(car.find((item) => item.id === "wheel_front_left")?.depth).toBe(2);
    const ground = tree.sections[0]?.objects.find((item) => item.id === "ground");
    expect(ground).toMatchObject({ icon: "terrain", meta: "asphalt" });
  });

  it("forgets a selection that no longer exists", () => {
    expect(sceneTree(project, catalog, "ghost").selected).toBeNull();
    expect(inspection(project, catalog, "ghost")).toEqual({ kind: "nothing" });
  });
});

describe("inspection", () => {
  it("shows one section per component of the car", () => {
    expect(sections(inspection(project, catalog, "car")).map((section) => section.title)).toEqual([
      "Transform",
      "Mesh",
      "Material",
      "Physics body",
      "Collider",
      "Distance ray",
    ]);
  });

  it("marks values that differ from the library default", () => {
    const physics = sections(inspection(project, catalog, "car")).find((section) => section.id === "physics_body");
    const mass = physics?.properties.find((item) => item.id === "mass");
    expect(mass).toMatchObject({ type: "number", value: 900, unit: "kg", state: "changed", was: "1 kg" });
    const friction = sections(inspection(project, catalog, "car"))
      .find((section) => section.id === "collider")
      ?.properties.find((item) => item.id === "friction");
    expect(friction).toMatchObject({ type: "slider", min: 0, max: 2, step: 0.05, state: "default" });
  });
});

describe("values", () => {
  const schemas: PropertySchema[] = catalog.components.flatMap((kind) => kind.properties);

  it.each(schemas.map((schema) => [`${schema.id} (${schema.type})`, schema] as const))(
    "%s round-trips between the engine and the inspector",
    (_, schema) => {
      const value: PropertyValue = schema.default;
      expect(toContractValue(toViewValue(schema, value))).toEqual(value);
    },
  );
});

it("groups component kinds for the Add component picker", () => {
  const groups = componentGroups(catalog);
  expect(groups.map((group) => group.label)).toContain("Physics");
  expect(groups.flatMap((group) => group.kinds).find((kind) => kind.id === "motor")).toMatchObject({
    label: "Motor",
    icon: "motor",
  });
  expect(groups.flatMap((group) => group.kinds).find((kind) => kind.id === "transform")?.unique).toBe(true);
});
