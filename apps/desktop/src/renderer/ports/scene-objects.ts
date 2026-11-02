import type { ComponentSpec, EditOperation, ObjectSpec, Project, SceneDescription } from "@icarus/contracts";
import { poseUnder } from "./object-transform.ts";

// Edit operations for whole objects (duplicate, reparent), built from the project document.

const ID_LIMIT = 64;
const NAME_LIMIT = 80;
// A duplicate lands this far along its parent's X, so it does not start inside the original.
const DUPLICATE_OFFSET = 1;

type Container = { target: string; objects: readonly ObjectSpec[] };

// The object list holding the object: "world" or the body it belongs to.
function containerOf(project: Project, id: string): Container | undefined {
  if (project.world.objects.some((obj) => obj.id === id)) {
    return { target: "world", objects: project.world.objects };
  }
  const body = project.bodies.find((item) => item.objects.some((obj) => obj.id === id));
  return body ? { target: body.id, objects: body.objects } : undefined;
}

// The object and everything nested under it, parents before children.
function subtree(objects: readonly ObjectSpec[], root: string): ObjectSpec[] {
  const ids = new Set([root]);
  const result = objects.filter((obj) => obj.id === root);
  let grew = true;
  while (grew) {
    grew = false;
    for (const obj of objects) {
      if (obj.parent !== null && ids.has(obj.parent) && !ids.has(obj.id)) {
        ids.add(obj.id);
        result.push(obj);
        grew = true;
      }
    }
  }
  return result;
}

// An object id not taken yet: the id with "_copy", then numbered copies, within the id length limit.
export function nextObjectId(taken: ReadonlySet<string>, base: string): string {
  const named = (suffix: string) => `${base.slice(0, ID_LIMIT - suffix.length)}${suffix}`;
  let candidate = named("_copy");
  for (let n = 2; taken.has(candidate); n++) {
    candidate = named(`_copy_${n}`);
  }
  return candidate;
}

function shifted(components: readonly ComponentSpec[]): ComponentSpec[] {
  return components.map((component) => {
    const position = component.properties.position;
    if (component.kind !== "transform" || position?.type !== "vector") {
      return structuredClone(component);
    }
    const [x, y, z] = position.value;
    return {
      ...structuredClone(component),
      properties: { ...component.properties, position: { type: "vector", value: [x + DUPLICATE_OFFSET, y, z] } },
    };
  });
}

// Copies the object and everything nested under it next to the original; `copy` is the new object's id.
export function duplicateOperations(project: Project, id: string): { operations: EditOperation[]; copy: string } {
  const container = containerOf(project, id);
  const objects = container ? subtree(container.objects, id) : [];
  const root = objects[0];
  if (!container || !root) {
    throw new Error("That object is no longer in the project");
  }
  const taken = new Set(
    [...project.world.objects, ...project.bodies.flatMap((body) => body.objects)].map((obj) => obj.id),
  );
  const ids = new Map<string, string>();
  for (const obj of objects) {
    const copy = nextObjectId(taken, obj.id);
    taken.add(copy);
    ids.set(obj.id, copy);
  }
  const operations = objects.map((obj): EditOperation => {
    const isRoot = obj.id === root.id;
    const object: ObjectSpec = {
      id: ids.get(obj.id) ?? obj.id,
      name: isRoot ? `${obj.name} copy`.slice(0, NAME_LIMIT) : obj.name,
      parent: isRoot || obj.parent === null ? obj.parent : (ids.get(obj.parent) ?? obj.parent),
      components: isRoot ? shifted(obj.components) : structuredClone(obj.components),
    };
    return { op: "create_object", target: container.target, object };
  });
  return { operations, copy: ids.get(root.id) ?? root.id };
}

// Puts the object under a new parent (null: top level) and keeps it where it is in the world.
export function reparentOperations(
  project: Project,
  description: SceneDescription | null,
  id: string,
  parent: string | null,
): EditOperation[] {
  const container = containerOf(project, id);
  const obj = container?.objects.find((item) => item.id === id);
  if (!container || !obj) {
    throw new Error("That object is no longer in the project");
  }
  if (parent !== null) {
    if (!container.objects.some((item) => item.id === parent)) {
      throw new Error("An object can only move under another object of the same group");
    }
    if (subtree(container.objects, id).some((item) => item.id === parent)) {
      throw new Error("An object cannot go inside itself or something nested in it");
    }
  }
  const operations: EditOperation[] = [{ op: "reparent_object", object: id, parent }];
  const transform = obj.components.find((component) => component.kind === "transform");
  const body = description?.bodies.find((item) => item.name === id);
  const parentBody = parent === null ? null : description?.bodies.find((item) => item.name === parent);
  if (!transform || !body || parentBody === undefined) {
    return operations;
  }
  const pose = poseUnder(body, parentBody);
  for (const property of ["position", "rotation"] as const) {
    operations.push({
      op: "set_property",
      object: id,
      component: transform.id,
      property,
      value: { type: "vector", value: pose[property] },
    });
  }
  return operations;
}
