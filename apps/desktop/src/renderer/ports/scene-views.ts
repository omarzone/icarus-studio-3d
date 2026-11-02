import type {
  ComponentKindSpec,
  PropertyValue as EngineValue,
  LibraryCatalog,
  ObjectSpec,
  Project,
  PropertySchema,
} from "@icarus/contracts";
import { formatPropertyValue } from "./property-format.ts";
import type {
  ComponentGroup,
  Inspection,
  InspectorSection,
  Property,
  PropertyValue,
  SceneIcon,
  SceneObject,
  SceneSection,
  SceneTree,
} from "./scene-port.ts";

// The icons the engine library may name; anything else falls back to a box.
const ENGINE_ICONS = [
  "agent",
  "balance",
  "box",
  "collider",
  "goal",
  "joint",
  "material",
  "mesh",
  "motor",
  "physics",
  "ray",
  "spawn",
  "sun",
  "target",
  "terrain",
  "touch",
  "transform",
  "walls",
  "zone",
] as const satisfies readonly SceneIcon[];

export function sceneIcon(name: string): SceneIcon {
  return ENGINE_ICONS.find((icon) => icon === name) ?? "box";
}

const OBJECT_ICONS: readonly [kind: string, icon: SceneIcon][] = [
  ["motor", "motor"],
  ["light", "sun"],
  ["goal_zone", "goal"],
  ["spawn_point", "spawn"],
  ["surface", "terrain"],
  ["zone", "zone"],
  ["joint", "joint"],
];

function objectIcon(obj: ObjectSpec, inBody: boolean): SceneIcon {
  if (inBody && obj.parent === null) {
    return "agent";
  }
  const kinds = new Set(obj.components.map((component) => component.kind));
  return OBJECT_ICONS.find(([kind]) => kinds.has(kind))?.[1] ?? "box";
}

function textOf(value: EngineValue | undefined): string | undefined {
  return value && "value" in value && typeof value.value === "string" ? value.value : undefined;
}

function objectMeta(obj: ObjectSpec): string | undefined {
  const surface = obj.components.find((component) => component.kind === "surface");
  if (surface) {
    return textOf(surface.properties.kind);
  }
  const physics = obj.components.find((component) => component.kind === "physics_body");
  return physics && textOf(physics.properties.mode) === "static" ? "static" : undefined;
}

function depthOf(obj: ObjectSpec, byId: ReadonlyMap<string, ObjectSpec>): number {
  let depth = 0;
  for (let parent = obj.parent; parent !== null && depth < byId.size; depth++) {
    parent = byId.get(parent)?.parent ?? null;
  }
  return depth;
}

// Parents before children, siblings in document order.
function ordered(objects: readonly ObjectSpec[], inBody: boolean): SceneObject[] {
  const byId = new Map(objects.map((obj) => [obj.id, obj]));
  const result: SceneObject[] = [];
  const visit = (parent: string | null) => {
    for (const obj of objects) {
      if (obj.parent === parent || (parent === null && obj.parent !== null && !byId.has(obj.parent))) {
        if (result.some((item) => item.id === obj.id)) {
          continue;
        }
        result.push({
          id: obj.id,
          name: obj.name,
          icon: objectIcon(obj, inBody),
          meta: objectMeta(obj),
          depth: depthOf(obj, byId),
        });
        visit(obj.id);
      }
    }
  };
  visit(null);
  return result;
}

function allObjects(project: Project): ObjectSpec[] {
  return [...project.world.objects, ...project.bodies.flatMap((body) => body.objects)];
}

function findObject(project: Project, id: string | null): ObjectSpec | undefined {
  return id === null ? undefined : allObjects(project).find((obj) => obj.id === id);
}

export function sceneTree(project: Project, _catalog: LibraryCatalog, selected: string | null): SceneTree {
  const sections: SceneSection[] = [
    { label: "World", objects: ordered(project.world.objects, false) },
    ...project.bodies.map((body) => ({ label: body.name, objects: ordered(body.objects, true) })),
  ];
  return { selected: findObject(project, selected) ? selected : null, sections };
}

function options(schema: PropertySchema) {
  return (schema.options ?? []).map((option) => ({ value: option.value, label: option.label }));
}

function unit(schema: PropertySchema): string | undefined {
  return schema.unit ?? undefined;
}

// The engine stores only the value; the schema supplies bounds, step, unit and options.
export function toViewValue(schema: PropertySchema, value: EngineValue): PropertyValue {
  const min = schema.min ?? 0;
  const max = schema.max ?? 0;
  switch (value.type) {
    case "number":
      return { type: "number", value: value.value, unit: unit(schema) };
    case "slider":
      return { type: "slider", value: value.value, min, max, step: schema.step ?? 0.01, unit: unit(schema) };
    case "range":
      return { type: "range", low: value.low, high: value.high, min, max, unit: unit(schema) };
    case "choice":
      return { type: "choice", value: value.value, options: options(schema).map((option) => option.value) };
    case "list":
      return { type: "list", value: value.value, options: options(schema) };
    case "switch":
      return { type: "switch", value: value.value };
    case "color":
      return { type: "color", value: value.value };
    case "vector":
      return { type: "vector", value: [value.value[0], value.value[1], value.value[2]], unit: unit(schema) };
    case "count":
      return { type: "count", value: value.value, min, max };
    case "asset":
      return { type: "asset", value: value.value };
    case "panel":
      return { type: "readonly", value: value.value };
    case "readonly":
      return { type: "readonly", value: value.value };
  }
}

export function toContractValue(view: PropertyValue): EngineValue {
  switch (view.type) {
    case "number":
      return { type: "number", value: view.value };
    case "slider":
      return { type: "slider", value: view.value };
    case "choice":
      return { type: "choice", value: view.value };
    case "list":
      return { type: "list", value: view.value };
    case "switch":
      return { type: "switch", value: view.value };
    case "color":
      return { type: "color", value: view.value };
    case "count":
      return { type: "count", value: view.value };
    case "asset":
      return { type: "asset", value: view.value };
    case "readonly":
      return { type: "readonly", value: view.value };
    case "range":
      return { type: "range", low: view.low, high: view.high };
    case "vector":
      return { type: "vector", value: [view.value[0], view.value[1], view.value[2]] };
    case "panel":
      return { type: "panel", value: view.value };
  }
}

function same(a: EngineValue, b: EngineValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function property(schema: PropertySchema, stored: EngineValue | undefined): Property {
  const value = stored ?? schema.default;
  const view = toViewValue(schema, value);
  const changed = !same(value, schema.default);
  return {
    id: schema.id,
    label: schema.label,
    hint: schema.hint ?? undefined,
    state: changed ? "changed" : "default",
    was: changed ? formatPropertyValue(toViewValue(schema, schema.default)) : undefined,
    ...view,
  };
}

function kindOf(catalog: LibraryCatalog, kind: string): ComponentKindSpec | undefined {
  return catalog.components.find((item) => item.kind === kind);
}

export function inspection(project: Project, catalog: LibraryCatalog, selected: string | null): Inspection {
  const obj = findObject(project, selected);
  if (!obj) {
    return { kind: "nothing" };
  }
  const body = project.bodies.find((item) => item.objects.some((candidate) => candidate.id === obj.id));
  const sections: InspectorSection[] = obj.components.map((component) => {
    const kind = kindOf(catalog, component.kind);
    return {
      id: component.id,
      title: kind?.label ?? component.kind,
      icon: sceneIcon(kind?.icon ?? "box"),
      properties: (kind?.properties ?? []).map((schema) => property(schema, component.properties[schema.id])),
    };
  });
  const count = obj.components.length;
  return {
    kind: "object",
    title: obj.name,
    subtitle: `${body?.name ?? "World"} · ${count} component${count === 1 ? "" : "s"}`,
    icon: objectIcon(obj, body !== undefined),
    sections,
    components: true,
  };
}

export function componentGroups(catalog: LibraryCatalog): ComponentGroup[] {
  const groups = new Map<string, ComponentGroup["kinds"][number][]>();
  for (const kind of catalog.components) {
    const kinds = groups.get(kind.group) ?? [];
    kinds.push({ id: kind.kind, label: kind.label, icon: sceneIcon(kind.icon), unique: kind.unique });
    groups.set(kind.group, kinds);
  }
  return [...groups].map(([label, kinds]) => ({ label, kinds }));
}

export { allObjects, findObject };

// A component id not taken on the object: the kind itself, else the kind with the next free number.
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
