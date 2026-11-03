import type { ComponentSpec, DesignReport, Project, SceneDescription } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { isLibraryCatalog, isProject } from "../engine-client/response-checks.ts";
import { autoRigProgress, bodyParts, boneWeights, posePreview, rigCheckFromEngine } from "./body-views.ts";
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

const REPORT: DesignReport = {
  ok: false,
  duration_ms: 12,
  checks: [
    { id: "compiles", label: "Compiles in MuJoCo", status: "pass", detail: "" },
    { id: "settles", label: "Settles", status: "fail", detail: "Falls after 1.4 s" },
    { id: "sensors", label: "Sensors", status: "skip", detail: "" },
  ],
};

describe("rig check from the engine", () => {
  it("shows passes in green, failures and audit findings in amber and skipped tests as not run", () => {
    const check = rigCheckFromEngine({
      report: REPORT,
      findings: [{ id: "weak:shin", part: "shin", text: "Shin: motor too weak to lift it", fixable: true }],
      poses: [{ id: "rest", label: "Rest" }],
    });
    expect(check.checks).toEqual([
      { text: "Compiles in MuJoCo", tone: "ok" },
      { text: "Settles: Falls after 1.4 s", tone: "warn" },
      { text: "Sensors: not run", tone: "warn" },
      { text: "Shin: motor too weak to lift it", tone: "warn" },
    ]);
    // A test not run is never counted as a problem that blocks training.
    expect(check.problems).toBe(2);
    expect(check.poses).toEqual([{ id: "rest", label: "Rest" }]);
  });

  it("says whether the motors held a pose, how far it sagged and what overlaps", () => {
    const scene: SceneDescription = { revision: 1, bodies: [], geoms: [], lights: [] };
    const preview = posePreview({
      pose: "low",
      label: "Toward the lower limits",
      joints: 12,
      overlaps: ["Left forearm sinks 2 cm into Chest"],
      holds: false,
      seconds: 1,
      sag_degrees: 14.2,
      scene,
    });
    expect(preview.facts).toEqual([
      { text: "Cannot hold the pose for 1 s: it falls or tips over", tone: "warn" },
      { text: "Joints end 14.2° from the pose on average", tone: "warn" },
      { text: "Left forearm sinks 2 cm into Chest", tone: "warn" },
    ]);
  });

  it("maps skin weights and shows where an auto-rig stopped", () => {
    expect(
      boneWeights({
        body: "b",
        bones: [
          { part: "b_shin", name: "Shin", vertices: 40, coverage: 0.7, problem: "30% of its skin is nearer to Thigh" },
        ],
      }).bones,
    ).toEqual([{ id: "b_shin", name: "Shin", coverage: 0.7, problem: "30% of its skin is nearer to Thigh" }]);
    const failed = autoRigProgress({
      task_id: "t",
      file: "person.obj",
      state: "failed",
      percent: 50,
      message: "The rigged body did not pass its physics tests",
      steps: [
        { text: "Read person.obj", state: "done" },
        { text: "Stand-up physics test", state: "running" },
      ],
    });
    expect(failed.steps.map((step) => step.state)).toEqual(["done", "todo"]);
    expect(failed.message).toContain("physics tests");
  });
});
