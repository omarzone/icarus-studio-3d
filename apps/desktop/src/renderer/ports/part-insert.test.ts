import type { ObjectSpec, Project } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { isProject } from "../engine-client/response-checks.ts";
import { snapped, snappedScale } from "./object-transform.ts";
import { insertPartOperation, isPlaneFloor, partKind, sizedScale, slabOperations } from "./part-insert.ts";
import parking from "./testdata/parking-car.json";

function project(objects: ObjectSpec[] = []): Project {
  if (!isProject(parking.project)) {
    throw new Error("The parking car test data does not match the contract");
  }
  return { ...parking.project, world: { objects }, bodies: [] };
}

function block(id: string): ObjectSpec {
  return { id, name: id, parent: null, components: [] };
}

function plane(size: [number, number, number]): ObjectSpec {
  return {
    id: "floor",
    name: "Floor",
    parent: null,
    components: [
      {
        id: "mesh",
        kind: "mesh",
        properties: { shape: { type: "list", value: "plane" }, size: { type: "vector", value: size } },
      },
    ],
  };
}

const wedge = partKind("wedge");
if (!wedge) {
  throw new Error("the wedge part kind is missing");
}

describe("inserting a part", () => {
  it("creates one static plastic part resting on the point, snapped across the ground", () => {
    const operation = insertPartOperation(project(), wedge, [1.3, -0.6, 0], 0.5);
    expect(operation.op).toBe("create_object");
    if (operation.op !== "create_object") {
      return;
    }
    expect(operation.target).toBe("world");
    const components = Object.fromEntries(operation.object.components.map((item) => [item.kind, item.properties]));
    expect(components.transform?.position).toEqual({ type: "vector", value: [1.5, -0.5, 0.5] });
    expect(components.mesh?.shape).toEqual({ type: "list", value: "wedge" });
    expect(components.physics_body?.mode).toEqual({ type: "choice", value: "static" });
    expect(components.material?.preset).toEqual({ type: "list", value: "plastic" });
    expect(components.collider).toBeDefined();
  });

  it("keeps the exact point without a snap and lands on top of a part it was clicked on", () => {
    const operation = insertPartOperation(project(), wedge, [1.3, -0.6, 2], null);
    const transform = operation.op === "create_object" ? operation.object.components[0] : undefined;
    expect(transform?.properties.position).toEqual({ type: "vector", value: [1.3, -0.6, 2.5] });
  });

  it("numbers the id and the name when the plain id is taken", () => {
    const operation = insertPartOperation(project([block("wedge"), block("wedge_2")]), wedge, [0, 0, 0], null);
    expect(operation.op === "create_object" && [operation.object.id, operation.object.name]).toEqual([
      "wedge_3",
      "Wedge 3",
    ]);
  });
});

describe("snapping", () => {
  it("rounds to the step and leaves values alone without one", () => {
    expect(snapped(1.37, 0.25)).toBeCloseTo(1.25);
    expect(snapped(-0.8, 1)).toBe(-1);
    expect(snapped(1.37, null)).toBe(1.37);
  });

  it("stretches a side onto a multiple of the step, never thinner than one step", () => {
    expect(snappedScale(1.3, 2, 0.5) * 2).toBeCloseTo(2.5);
    expect(snappedScale(0.01, 2, 0.5) * 2).toBeCloseTo(0.5);
    expect(snappedScale(1.3, 2, null)).toBe(1.3);
  });

  it("snaps a stretched object's sides from its mesh size", () => {
    const part = plane([2, 4, 1]);
    expect(sizedScale(part, [1.3, 1.2, 1], 1)).toEqual([1.5, 1.25, 1]);
    expect(sizedScale(block("bare"), [1.3, 1.1, 1], 1)).toEqual([1.3, 1.1, 1]);
  });
});

describe("turning an endless plane into a slab", () => {
  it("adds a ground component of the plane's width and depth, a metre thick", () => {
    const floor = plane([40, 30, 0.1]);
    expect(isPlaneFloor(floor)).toBe(true);
    expect(slabOperations(floor)).toEqual([
      {
        op: "add_component",
        object: "floor",
        component: { id: "ground", kind: "ground", properties: { size: { type: "vector", value: [40, 30, 1] } } },
      },
    ]);
  });

  it("is not offered for a floor that is already a slab or for other shapes", () => {
    const slab = plane([40, 30, 0.1]);
    slab.components.push({ id: "ground", kind: "ground", properties: {} });
    expect(isPlaneFloor(slab)).toBe(false);
    expect(isPlaneFloor(block("box"))).toBe(false);
  });
});
