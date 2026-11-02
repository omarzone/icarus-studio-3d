import type { ComponentSpec, DesignReport, Project } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { isLibraryCatalog, isProject } from "../engine-client/response-checks.ts";
import { bodyParts, rigCheckFromReport } from "./body-views.ts";
import parking from "./testdata/parking-car.json";

const { project, catalog } = (() => {
  if (!isProject(parking.project) || !isLibraryCatalog(parking.catalog)) {
    throw new Error("bad test data");
  }
  return { project: parking.project, catalog: parking.catalog };
})();

describe("body parts", () => {
  it("lists each joint with its range and the motor that drives it", () => {
    const [car] = bodyParts(project, catalog);
    const steer = car?.joints.find((joint) => joint.part === "Front left steering");
    expect(steer).toEqual({
      id: "steer_left",
      part: "Front left steering",
      kind: "hinge",
      range: "-35° … 35°",
      motor: "position · 2000 N",
    });
    const wheel = car?.joints.find((joint) => joint.id === "wheel_front_left");
    expect(wheel?.motor).toBeUndefined();
    expect(car?.joints.find((joint) => joint.id === "wheel_rear_left")?.motor).toBe("torque · 400 N");
  });

  it("lists the senses each part carries with their library label", () => {
    const [car] = bodyParts(project, catalog);
    expect(car?.sensors).toEqual([{ id: "car/distance_ray", part: "Car", label: "Distance ray" }]);
    expect(car?.name).toBe("Car");
    expect(car?.parts).toBe(project.bodies[0]?.objects.length);
  });

  it("follows a motor that names another object's joint", () => {
    const doc: Project = structuredClone(project);
    const car = doc.bodies[0];
    const root = car?.objects.find((obj) => obj.id === "car");
    const motor: ComponentSpec = {
      id: "motor",
      kind: "motor",
      properties: {
        joint: { type: "asset", value: "wheel_front_left" },
        kind: { type: "choice", value: "torque" },
        max_force: { type: "number", value: 120 },
      },
    };
    root?.components.push(motor);
    const wheel = bodyParts(doc, catalog)[0]?.joints.find((joint) => joint.id === "wheel_front_left");
    expect(wheel?.motor).toBe("torque · 120 N");
  });
});

describe("rig check from the design report", () => {
  it("shows passes in green, failures in amber and skipped tests as not run", () => {
    const report: DesignReport = {
      ok: false,
      duration_ms: 12,
      checks: [
        { id: "compiles", label: "Compiles in MuJoCo", status: "pass", detail: "" },
        { id: "settles", label: "Settles", status: "fail", detail: "Falls after 1.4 s" },
        { id: "sensors", label: "Sensors", status: "skip", detail: "" },
      ],
    };
    expect(rigCheckFromReport(report).checks).toEqual([
      { text: "Compiles in MuJoCo", tone: "ok" },
      { text: "Settles: Falls after 1.4 s", tone: "warn" },
      { text: "Sensors: not run", tone: "warn" },
    ]);
    expect(rigCheckFromReport(report).poses).toEqual([]);
  });
});
