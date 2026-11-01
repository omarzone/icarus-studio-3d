import type { EditOperation, LibraryCatalog, Project, PropertySchema } from "@icarus/contracts";
import type { EngineApi } from "../engine-client/engine-api.ts";
import type { GuideProgress, PropertyReference, PropertyType, ScenePort } from "./scene-port.ts";
import { componentGroups, findObject, inspection, sceneTree, toContractValue, toViewValue } from "./scene-views.ts";

type SceneApi = Pick<EngineApi, "project" | "library" | "applyOperations" | "scene">;

export type EngineScenePort = Omit<ScenePort, "acceptProposedValue" | "toggleVariation">;

export function nextComponentId(taken: readonly string[], kind: string): string {
  if (!taken.includes(kind)) {
    return kind;
  }
  let n = 2;
  while (taken.includes(`${kind}_${n}`)) {
    n++;
  }
  return `${kind}_${n}`;
}

type Vec3 = [number, number, number];

// Rotates a world vector into a parent frame whose world rotation is the quaternion wxyz.
export function worldToParent([x, y, z]: Vec3, [w, qx, qy, qz]: readonly [number, number, number, number]): Vec3 {
  // Inverse rotation: the conjugate quaternion applied to the vector.
  const [cx, cy, cz] = [-qx, -qy, -qz];
  const tx = 2 * (cy * z - cz * y);
  const ty = 2 * (cz * x - cx * z);
  const tz = 2 * (cx * y - cy * x);
  return [x + w * tx + (cy * tz - cz * ty), y + w * ty + (cz * tx - cx * tz), z + w * tz + (cx * ty - cy * tx)];
}

function guide(project: Project): GuideProgress {
  const objects = [...project.world.objects, ...project.bodies.flatMap((body) => body.objects)];
  const steps = [
    project.bodies.length > 0,
    objects.some((obj) => obj.components.some((component) => component.kind === "goal_zone")),
    project.task.rewards.length > 0,
    // Training lands in Sprint 5; no project has trained yet.
    false,
  ];
  const done = steps.filter(Boolean).length;
  return { started: done > 0, done, total: steps.length };
}

function reference(catalog: LibraryCatalog): PropertyReference {
  const seen = new Map<PropertyType, PropertySchema>();
  for (const schema of catalog.components.flatMap((kind) => kind.properties)) {
    if (!seen.has(schema.type)) {
      seen.set(schema.type, schema);
    }
  }
  const sample = (schema: PropertySchema) => ({
    id: schema.id,
    label: schema.label,
    state: "default" as const,
    ...toViewValue(schema, schema.default),
  });
  const first = [...seen.values()][0];
  return {
    types: [...seen].map(([type, schema]) => ({
      type,
      label: type.charAt(0).toUpperCase() + type.slice(1),
      use: schema.hint ?? `${schema.label} uses this control`,
      sample: sample(schema),
    })),
    states: first ? [{ state: "default", label: "Default", use: "The library value", sample: sample(first) }] : [],
  };
}

// The scene port on the engine: the document comes from the engine, selection stays in the app.
export function createEngineScenePort(api: SceneApi): EngineScenePort {
  const selection = new Map<string, string | null>();
  let catalog: Promise<LibraryCatalog> | undefined;
  const library = () => {
    catalog ??= api.library().catch((error: unknown) => {
      catalog = undefined;
      throw error;
    });
    return catalog;
  };
  const load = async (scene: string) => {
    const [state, lib] = await Promise.all([api.project(scene), library()]);
    return { project: state.project, catalog: lib, selected: selection.get(scene) ?? null };
  };
  const selectedObject = async (scene: string) => {
    const current = await load(scene);
    const obj = findObject(current.project, current.selected);
    if (!obj) {
      throw new Error("Select an object first");
    }
    return { ...current, obj };
  };
  const edit = async (scene: string, operations: EditOperation[], summary: string) => {
    const state = await api.applyOperations(scene, operations, summary);
    return inspection(state.project, await library(), selection.get(scene) ?? null);
  };
  const schemaOf = (lib: LibraryCatalog, kind: string | undefined, property: string) =>
    lib.components.find((item) => item.kind === kind)?.properties.find((item) => item.id === property);

  return {
    getTree: async (scene) => {
      const { project, catalog: lib, selected } = await load(scene);
      return sceneTree(project, lib, selected);
    },
    selectObject: async ({ scene, id }) => {
      selection.set(scene, id);
      const { project, catalog: lib } = await load(scene);
      return sceneTree(project, lib, id);
    },
    getInspection: async (scene) => {
      const { project, catalog: lib, selected } = await load(scene);
      return inspection(project, lib, selected);
    },
    setProperty: async ({ scene, section, property, value }) => {
      const { obj } = await selectedObject(scene);
      const operation: EditOperation = {
        op: "set_property",
        object: obj.id,
        component: section,
        property,
        value: toContractValue(value),
      };
      return edit(scene, [operation], `Changed ${property} on ${obj.name}`);
    },
    resetProperty: async ({ scene, section, property }) => {
      const { obj, catalog: lib } = await selectedObject(scene);
      const component = obj.components.find((item) => item.id === section);
      const schema = schemaOf(lib, component?.kind, property);
      if (!schema) {
        throw new Error(`${obj.name} has no ${property} to reset`);
      }
      const operation: EditOperation = {
        op: "set_property",
        object: obj.id,
        component: section,
        property,
        value: schema.default,
      };
      return edit(scene, [operation], `Reset ${schema.label} on ${obj.name}`);
    },
    listComponentKinds: async () => componentGroups(await library()),
    addComponent: async ({ scene, kind }) => {
      const { obj, catalog: lib } = await selectedObject(scene);
      const spec = lib.components.find((item) => item.kind === kind);
      if (!spec) {
        throw new Error(`${kind} is not in the library`);
      }
      const id = nextComponentId(
        obj.components.map((item) => item.id),
        kind,
      );
      const properties = Object.fromEntries(spec.properties.map((schema) => [schema.id, schema.default]));
      const operation: EditOperation = { op: "add_component", object: obj.id, component: { id, kind, properties } };
      return edit(scene, [operation], `Added ${spec.label} to ${obj.name}`);
    },
    getTrainingCopies: async (scene) => {
      const { project } = await load(scene);
      return { copies: project.brain.copies, layout: "Grid", layouts: ["Grid"], variations: [] };
    },
    setTrainingCopies: async ({ scene, copies }) => {
      const state = await api.applyOperations(scene, [{ op: "set_brain", copies }], `${copies} training copies`);
      return { copies: state.project.brain.copies, layout: "Grid", layouts: ["Grid"], variations: [] };
    },
    getGuide: async (scene) => guide((await load(scene)).project),
    getSceneDescription: (scene) => api.scene(scene),
    moveObject: async ({ scene, id, delta }) => {
      const [{ project }, description] = await Promise.all([load(scene), api.scene(scene)]);
      const obj = findObject(project, id);
      const transform = obj?.components.find((component) => component.kind === "transform");
      const position = transform?.properties.position;
      if (!obj || !transform || position?.type !== "vector") {
        throw new Error("Only objects with a Transform can be moved");
      }
      const parent = description.bodies.find((body) => body.name === obj.parent);
      const local = parent ? worldToParent(delta, parent.quaternion) : delta;
      const value: Vec3 = [position.value[0] + local[0], position.value[1] + local[1], position.value[2] + local[2]];
      const operation: EditOperation = {
        op: "set_property",
        object: obj.id,
        component: transform.id,
        property: "position",
        value: { type: "vector", value },
      };
      return edit(scene, [operation], `Moved ${obj.name}`);
    },
    getPropertyReference: async () => reference(await library()),
  };
}
