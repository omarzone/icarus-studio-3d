import type { DesignReport, LibraryCatalog, ObjectSpec, Project, PropertyValue } from "@icarus/contracts";
import type { BodyJoint, BodyParts, BodySensor, RigCheck } from "./body-port.ts";

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
export function rigCheckFromReport(report: DesignReport): RigCheck {
  return {
    checks: report.checks.map((check) => {
      if (check.status === "skip") {
        return { text: `${check.label}: not run`, tone: "warn" };
      }
      return {
        text: check.detail ? `${check.label}: ${check.detail}` : check.label,
        tone: check.status === "pass" ? "ok" : "warn",
      };
    }),
    poseHint: "Test poses are not available yet.",
    poses: [],
  };
}
