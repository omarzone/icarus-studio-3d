import type { EditOperation, LibraryCatalog, Project, PropertySchema } from "@icarus/contracts";
import type { CopiesApi, EngineApi } from "../engine-client/engine-api.ts";
import { brainInspection, brainSettingOperation, brainSettingReset } from "./brain-settings-views.ts";
import { trainingVariations, variationOperations } from "./copy-variations.ts";
import { guideProgress } from "./guide-progress.ts";
import { type Quat, stretchedScale, turnedRotation, type Vec3, worldToParent } from "./object-transform.ts";
import { duplicateOperations, reparentOperations } from "./scene-objects.ts";
import type { PropertyReference, PropertyType, ScenePort, TrainingCopies } from "./scene-port.ts";
import {
  componentGroups,
  findObject,
  inspection,
  nextComponentId,
  sceneTree,
  toContractValue,
  toViewValue,
} from "./scene-views.ts";

export { nextComponentId } from "./scene-views.ts";

type SceneApi = Pick<EngineApi, "project" | "library" | "applyOperations" | "scene" | "runs"> & CopiesApi;

export type EngineScenePort = Omit<ScenePort, "acceptProposedValue">;

// Copies are laid out in a grid, as Live training shows them.
const LAYOUTS = ["Grid"];

function trainingCopies(project: Project): TrainingCopies {
  return { copies: project.brain.copies, layout: "Grid", layouts: LAYOUTS, variations: trainingVariations(project) };
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

function settingLabel(catalog: LibraryCatalog, id: string): string {
  return (catalog.brain_settings?.find((schema) => schema.id === id)?.label ?? id).toLowerCase();
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
  const objectOf = async (scene: string, id: string) => {
    const current = await load(scene);
    const obj = findObject(current.project, id);
    if (!obj) {
      throw new Error("That object is no longer in the project");
    }
    return { ...current, obj };
  };
  const editTree = async (scene: string, operations: EditOperation[], summary: string) => {
    const state = await api.applyOperations(scene, operations, summary);
    return sceneTree(state.project, await library(), selection.get(scene) ?? null);
  };
  // Reads one Transform vector of an object and writes back what `change` makes of it under its parent's rotation.
  const editTransform = async (
    scene: string,
    id: string,
    property: "position" | "rotation" | "scale",
    verb: "Moved" | "Rotated" | "Scaled",
    change: (value: Vec3, parent: Quat | undefined) => Vec3,
  ) => {
    const [{ project }, description] = await Promise.all([load(scene), api.scene(scene)]);
    const obj = findObject(project, id);
    const transform = obj?.components.find((component) => component.kind === "transform");
    const current = transform?.properties[property];
    if (!obj || !transform || current?.type !== "vector") {
      throw new Error(`Only objects with a Transform can be ${verb.toLowerCase()}`);
    }
    const parent = description.bodies.find((body) => body.name === obj.parent)?.quaternion;
    const operation: EditOperation = {
      op: "set_property",
      object: obj.id,
      component: transform.id,
      property,
      value: { type: "vector", value: change(current.value, parent) },
    };
    return edit(scene, [operation], `${verb} ${obj.name}`);
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
    selectKind: async ({ scene, kind }) => {
      const { project, catalog: lib } = await load(scene);
      const objects = [...project.world.objects, ...project.bodies.flatMap((body) => body.objects)];
      const found = objects.find((obj) => obj.components.some((component) => component.kind === kind));
      if (!found) {
        return null;
      }
      selection.set(scene, found.id);
      return sceneTree(project, lib, found.id);
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
    getBrainSettings: async (scene) => {
      const { project, catalog: lib } = await load(scene);
      return brainInspection(project, lib);
    },
    setBrainSetting: async ({ scene, property, value }) => {
      const { project, catalog: lib } = await load(scene);
      const operation = brainSettingOperation(project, lib, property, value);
      const state = await api.applyOperations(scene, [operation], `Changed the brain's ${settingLabel(lib, property)}`);
      return brainInspection(state.project, lib);
    },
    resetBrainSetting: async ({ scene, property }) => {
      const { project, catalog: lib } = await load(scene);
      const operation = brainSettingReset(project, lib, property);
      const state = await api.applyOperations(scene, [operation], `Reset the brain's ${settingLabel(lib, property)}`);
      return brainInspection(state.project, lib);
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
    removeComponent: async ({ scene, section }) => {
      const { obj, catalog: lib } = await selectedObject(scene);
      const component = obj.components.find((item) => item.id === section);
      if (!component) {
        throw new Error(`${obj.name} has no ${section} to remove`);
      }
      const label = lib.components.find((item) => item.kind === component.kind)?.label ?? component.kind;
      const operation: EditOperation = { op: "remove_component", object: obj.id, component: section };
      return edit(scene, [operation], `Removed ${label} from ${obj.name}`);
    },
    getTrainingCopies: async (scene) => trainingCopies((await load(scene)).project),
    setTrainingCopies: async ({ scene, copies }) => {
      const state = await api.applyOperations(scene, [{ op: "set_brain", copies }], `${copies} training copies`);
      return trainingCopies(state.project);
    },
    toggleVariation: async ({ scene, id }) => {
      const { project, catalog: lib } = await load(scene);
      const operations = variationOperations(project, lib, id);
      if (operations.length === 0) {
        throw new Error("Nothing in this world can vary that way");
      }
      const label = trainingVariations(project).find((item) => item.id === id);
      const summary = `${label?.enabled ? "Stopped varying" : "Varied"} ${label?.label.toLowerCase() ?? id} between copies`;
      return trainingCopies((await api.applyOperations(scene, operations, summary)).project);
    },
    getCopyScenes: ({ scene, count }) => api.copyScenes(scene, count),
    getGuide: async (scene) => {
      const [{ project }, runs] = await Promise.all([load(scene), api.runs(scene)]);
      return guideProgress(project, runs);
    },
    getSceneDescription: (scene) => api.scene(scene),
    moveObject: ({ scene, id, delta }) =>
      editTransform(scene, id, "position", "Moved", (position, parent) => {
        const local = parent ? worldToParent(delta, parent) : delta;
        return [position[0] + local[0], position[1] + local[1], position[2] + local[2]];
      }),
    rotateObject: ({ scene, id, delta }) =>
      editTransform(scene, id, "rotation", "Rotated", (rotation, parent) => turnedRotation(rotation, delta, parent)),
    scaleObject: ({ scene, id, factor }) =>
      editTransform(scene, id, "scale", "Scaled", (scale) => stretchedScale(scale, factor)),
    renameObject: async ({ scene, id, name }) => {
      const { obj } = await objectOf(scene, id);
      const trimmed = name.trim();
      if (!trimmed) {
        throw new Error("A name cannot be empty");
      }
      return editTree(scene, [{ op: "rename_object", object: id, name: trimmed }], `Renamed ${obj.name} to ${trimmed}`);
    },
    duplicateObject: async ({ scene, id }) => {
      const { project, obj } = await objectOf(scene, id);
      const { operations, copy } = duplicateOperations(project, id);
      const state = await api.applyOperations(scene, operations, `Duplicated ${obj.name}`);
      selection.set(scene, copy);
      return sceneTree(state.project, await library(), copy);
    },
    deleteObject: async ({ scene, id }) => {
      const { obj } = await objectOf(scene, id);
      return editTree(scene, [{ op: "delete_object", object: id }], `Deleted ${obj.name}`);
    },
    reparentObject: async ({ scene, id, parent }) => {
      const [{ project, obj }, description] = await Promise.all([objectOf(scene, id), api.scene(scene)]);
      const operations = reparentOperations(project, description, id, parent);
      const into = parent === null ? undefined : findObject(project, parent)?.name;
      return editTree(
        scene,
        operations,
        into ? `Moved ${obj.name} into ${into}` : `Moved ${obj.name} to the top level`,
      );
    },
    getPropertyReference: async () => reference(await library()),
  };
}
