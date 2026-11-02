import type { SceneDescription } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { isProject } from "../engine-client/response-checks.ts";
import { duplicateOperations, nextObjectId, reparentOperations } from "./scene-objects.ts";
import parking from "./testdata/parking-car.json";

const project = (() => {
  if (!isProject(parking.project)) {
    throw new Error("bad test data");
  }
  return parking.project;
})();

const HALF = Math.SQRT1_2;

describe("duplicateOperations", () => {
  it("copies an object with what is nested in it, beside the original, with fresh ids", () => {
    const { operations, copy } = duplicateOperations(project, "steer_left");
    expect(copy).toBe("steer_left_copy");
    expect(operations).toHaveLength(2);
    const [root, child] = operations;
    if (root?.op !== "create_object" || child?.op !== "create_object") {
      throw new Error("expected two create_object operations");
    }
    expect(root.target).toBe("car_body");
    expect(root.object).toMatchObject({ id: "steer_left_copy", name: "Front left steering copy", parent: "car" });
    const transform = root.object.components.find((component) => component.kind === "transform");
    expect(transform?.properties.position).toEqual({ type: "vector", value: [2.3, 1.05, -0.2] });
    expect(child.object).toMatchObject({
      id: "wheel_front_left_copy",
      name: "Front left wheel",
      parent: "steer_left_copy",
    });
  });

  it("numbers copies whose id is taken", () => {
    expect(nextObjectId(new Set(["car_copy"]), "car")).toBe("car_copy_2");
    expect(nextObjectId(new Set(), "x".repeat(70))).toHaveLength(64);
  });
});

describe("reparentOperations", () => {
  it("refuses a parent outside the object's group, or nested inside the object", () => {
    expect(() => reparentOperations(project, null, "goal", "ground")).toThrow(/same group/);
    expect(() => reparentOperations(project, null, "car", "wheel_front_left")).toThrow(/inside itself/);
  });

  it("keeps the object where it is in the world under its new parent", () => {
    const description: SceneDescription = {
      revision: 1,
      lights: [],
      geoms: [],
      bodies: [
        { name: "steer_left", parent: "car", position: [1.3, 1.05, 0.3], quaternion: [HALF, 0, 0, HALF] },
        { name: "wheel_rear_left", parent: "car", position: [-1.3, 1.05, 0.3], quaternion: [HALF, HALF, 0, 0] },
      ],
    };
    const operations = reparentOperations(project, description, "wheel_rear_left", "steer_left");
    expect(operations[0]).toEqual({ op: "reparent_object", object: "wheel_rear_left", parent: "steer_left" });
    const [position, rotation] = operations.slice(1);
    if (position?.op !== "set_property" || rotation?.op !== "set_property") {
      throw new Error("expected the transform to follow");
    }
    // 2.6 m behind the steering in world X, which is the steering's −Y once it is turned 90° about Z.
    expect(position.value).toEqual({ type: "vector", value: [0, 2.6, 0] });
    // Wheel turned 90° about world X, seen from a parent turned 90° about Z.
    expect(rotation.value).toEqual({ type: "vector", value: [90, -90, 0] });
  });

  it("only reparents when the scene has no pose to keep", () => {
    expect(reparentOperations(project, null, "wheel_rear_left", null)).toEqual([
      { op: "reparent_object", object: "wheel_rear_left", parent: null },
    ]);
  });
});
