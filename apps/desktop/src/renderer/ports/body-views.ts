import type {
  AutoRigStatus,
  DesignReport,
  RigCheck as EngineRigCheck,
  LibraryCatalog,
  ObjectSpec,
  PoseResult,
  Project,
  PropertyValue,
  SkinWeights,
} from "@icarus/contracts";
import type {
  AutoRigProgress,
  BodyJoint,
  BodyParts,
  BodySensor,
  BoneWeights,
  PosePreview,
  RigCheck,
} from "./body-port.ts";
import type { CheckFact } from "./progress-step.ts";

function propertyOf(obj: ObjectSpec, kind: string, id: string): PropertyValue | undefined {
  return obj.components.find((component) => component.kind === kind)?.properties[id];
}

function text(value: PropertyValue | undefined, fallback: string): string {
  return value && "value" in value && typeof value.value === "string" && value.value !== "" ? value.value : fallback;
}

function amount(value: PropertyValue | undefined, fallback: number): number {
  return value && "value" in value && typeof value.value === "number" ? value.value : fallback;
}

// Hinges and balls turn in degrees, slides move in metres, fixed joints do not move.
function rangeOf(kind: string, limits: PropertyValue | undefined): string {
  if (kind === "fixed") {
    return "fixed";
  }
  const [low, high] = limits?.type === "range" ? [limits.low, limits.high] : [-90, 90];
  return kind === "slide" ? `${low} m … ${high} m` : `${low}° … ${high}°`;
}

function motorText(motor: ObjectSpec): string {
  const kind = text(propertyOf(motor, "motor", "kind"), "position");
  return `${kind} · ${amount(propertyOf(motor, "motor", "max_force"), 50)} N`;
}

function partsOf(objects: readonly ObjectSpec[], catalog: LibraryCatalog): Omit<BodyParts, "id" | "name"> {
  const senses = new Map(
    catalog.components.filter((kind) => kind.group === "Senses").map((kind) => [kind.kind, kind.label]),
  );
  // A motor drives the joint of the object it names, or its own joint when it names none.
  const motors = new Map(
    objects
      .filter((obj) => obj.components.some((component) => component.kind === "motor"))
      .map((obj) => [text(propertyOf(obj, "motor", "joint"), obj.id), motorText(obj)]),
  );
  const joints: BodyJoint[] = objects.flatMap((obj) => {
    if (!obj.components.some((component) => component.kind === "joint")) {
      return [];
    }
    const kind = text(propertyOf(obj, "joint", "kind"), "hinge");
    const motor = motors.get(obj.id);
    const joint: BodyJoint = {
      id: obj.id,
      part: obj.name,
      kind,
      range: rangeOf(kind, propertyOf(obj, "joint", "limits")),
    };
    return motor ? [{ ...joint, motor }] : [joint];
  });
  const sensors: BodySensor[] = objects.flatMap((obj) =>
    obj.components.flatMap((component) => {
      const label = senses.get(component.kind);
      return label ? [{ id: `${obj.id}/${component.id}`, part: obj.name, label }] : [];
    }),
  );
  return { parts: objects.length, joints, sensors };
}

// Each body of the project with its joints, the motors that drive them and the senses it carries.
export function bodyParts(project: Project, catalog: LibraryCatalog): BodyParts[] {
  return project.bodies.map((body) => ({ id: body.id, name: body.name, ...partsOf(body.objects, catalog) }));
}

// The design tests the engine ran on the latest revision; a skipped test is not run, never a pass.
export function reportFacts(report: DesignReport): CheckFact[] {
  return report.checks.map((check) => {
    if (check.status === "skip") {
      return { text: `${check.label}: not run`, tone: "warn" };
    }
    return {
      text: check.detail ? `${check.label}: ${check.detail}` : check.label,
      tone: check.status === "pass" ? "ok" : "warn",
    };
  });
}

const POSE_HINT = "Each pose sets the joints in the physics engine, then the body's own motors hold it for a second.";

// The design tests run again now, then each problem the rig audit found, and the poses the body can take.
export function rigCheckFromEngine(check: EngineRigCheck): RigCheck {
  const findings: CheckFact[] = check.findings.map((finding) => ({
    text: finding.text,
    tone: "warn",
    part: finding.part,
  }));
  return {
    checks: [...reportFacts(check.report), ...findings],
    problems: check.report.checks.filter((item) => item.status === "fail").length + check.findings.length,
    poseHint: check.poses.length > 0 ? POSE_HINT : "Add a body to try poses.",
    poses: check.poses,
  };
}

// What MuJoCo found after the motors held the pose.
export function posePreview(result: PoseResult): PosePreview {
  const held: CheckFact = result.holds
    ? { text: `Holds the pose for ${result.seconds} s with its own motors`, tone: "ok" }
    : { text: `Cannot hold the pose for ${result.seconds} s: it falls or tips over`, tone: "warn" };
  const sag: CheckFact = {
    text: `Joints end ${result.sag_degrees}° from the pose on average`,
    tone: result.sag_degrees <= 10 ? "ok" : "warn",
  };
  const overlaps: CheckFact[] = result.overlaps.map((text) => ({ text, tone: "warn" }));
  return { label: result.label, facts: [held, sag, ...overlaps], scene: result.scene };
}

export function boneWeights(weights: SkinWeights): BoneWeights {
  return {
    bones: weights.bones.map((bone) => {
      const row = { id: bone.part, name: bone.name, coverage: bone.coverage };
      return bone.problem ? { ...row, problem: bone.problem } : row;
    }),
  };
}

export function autoRigProgress(status: AutoRigStatus): AutoRigProgress {
  const progress: AutoRigProgress = {
    file: status.file,
    percent: status.percent,
    state: status.state,
    // A failed or stopped auto-rig shows the step it stopped at as still to do.
    steps: status.steps.map((step) => ({
      text: step.text,
      state: status.state !== "running" && step.state === "running" ? "todo" : step.state,
    })),
  };
  return status.message ? { ...progress, message: status.message } : progress;
}
