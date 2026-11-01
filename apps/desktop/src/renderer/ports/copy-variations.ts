import type { ComponentSpec, EditOperation, LibraryCatalog, ObjectSpec, Project } from "@icarus/contracts";
import type { Variation } from "./scene-port.ts";
import { nextComponentId } from "./scene-views.ts";

// What changes between training copies, as Randomize components on world objects: props move and recolor, the
// ground's grip varies. The engine samples them per copy (seed + copy index); this only reads and writes the components.

type Value = ComponentSpec["properties"][string];
type Setting = { property: string; on: Value; off: Value };

type VariationKind = {
  id: string;
  label: string;
  // The world objects this variation applies to.
  applies: (obj: ObjectSpec) => boolean;
  settings: readonly Setting[];
  isOn: (randomize: ComponentSpec) => boolean;
  detail: (randomize: ComponentSpec) => string;
};

const RANDOMIZE = "randomize";

const component = (obj: ObjectSpec, kind: string) => obj.components.find((item) => item.kind === kind);

function numberOf(randomize: ComponentSpec, property: string): number {
  const value = randomize.properties[property];
  return value?.type === "number" || value?.type === "slider" ? value.value : 0;
}

function spread(randomize: ComponentSpec): number {
  const value = randomize.properties.position_range;
  return value?.type === "vector" ? Math.max(value.value[0], value.value[1]) : 0;
}

function shapeOf(obj: ObjectSpec): string | null {
  const shape = component(obj, "mesh")?.properties.shape;
  return shape?.type === "list" || shape?.type === "choice" ? shape.value : null;
}

const isGround = (obj: ObjectSpec) => shapeOf(obj) === "plane" || component(obj, "surface") !== undefined;
const isProp = (obj: ObjectSpec) => !isGround(obj) && shapeOf(obj) !== null;

// Turned on from the popover: up to 1 m either way on the ground and a 15° turn, colors shifted, grip ± 10%.
const KINDS: readonly VariationKind[] = [
  {
    id: "positions",
    label: "Object positions",
    applies: isProp,
    settings: [
      {
        property: "position_range",
        on: { type: "vector", value: [1, 1, 0] },
        off: { type: "vector", value: [0, 0, 0] },
      },
      { property: "rotation_range", on: { type: "number", value: 15 }, off: { type: "number", value: 0 } },
    ],
    isOn: (randomize) => spread(randomize) > 0 || numberOf(randomize, "rotation_range") > 0,
    detail: (randomize) => {
      const move = spread(randomize);
      const turn = numberOf(randomize, "rotation_range");
      return [move > 0 ? `± ${move} m` : null, turn > 0 ? `± ${turn}°` : null].filter(Boolean).join(", ");
    },
  },
  {
    id: "colors",
    label: "Object colors",
    applies: isProp,
    settings: [{ property: "color", on: { type: "switch", value: true }, off: { type: "switch", value: false } }],
    isOn: (randomize) => randomize.properties.color?.type === "switch" && randomize.properties.color.value,
    detail: () => "shifted shades",
  },
  {
    id: "grip",
    label: "Ground grip",
    applies: isGround,
    settings: [{ property: "friction_spread", on: { type: "slider", value: 10 }, off: { type: "slider", value: 0 } }],
    isOn: (randomize) => numberOf(randomize, "friction_spread") > 0,
    detail: (randomize) => `± ${numberOf(randomize, "friction_spread")}%`,
  },
];

function varying(kind: VariationKind, objects: readonly ObjectSpec[]): ObjectSpec[] {
  return objects.filter((obj) => {
    const randomize = component(obj, RANDOMIZE);
    return randomize !== undefined && kind.isOn(randomize);
  });
}

// The variations this world can have, each naming the objects that vary (or would, while it is off).
export function trainingVariations(project: Project): Variation[] {
  return KINDS.flatMap((kind) => {
    const candidates = project.world.objects.filter(kind.applies);
    if (candidates.length === 0) {
      return [];
    }
    const on = varying(kind, candidates);
    const first = on[0] ? component(on[0], RANDOMIZE) : undefined;
    return [
      {
        id: kind.id,
        label: kind.label,
        enabled: on.length > 0,
        detail: first ? kind.detail(first) : "off",
        objects: (on.length > 0 ? on : candidates).map((obj) => obj.name),
      },
    ];
  });
}

// Edit operations that turn a variation off where it is on, or on for every object it applies to.
export function variationOperations(project: Project, catalog: LibraryCatalog, id: string): EditOperation[] {
  const kind = KINDS.find((item) => item.id === id);
  if (!kind) {
    throw new Error(`Nothing called ${id} varies between copies`);
  }
  const candidates = project.world.objects.filter(kind.applies);
  const on = varying(kind, candidates);
  const set = (obj: ObjectSpec, randomize: ComponentSpec, value: (setting: Setting) => Value): EditOperation[] =>
    kind.settings.map((setting) => ({
      op: "set_property",
      object: obj.id,
      component: randomize.id,
      property: setting.property,
      value: value(setting),
    }));
  if (on.length > 0) {
    return on.flatMap((obj) => {
      const randomize = component(obj, RANDOMIZE);
      return randomize ? set(obj, randomize, (setting) => setting.off) : [];
    });
  }
  const spec = catalog.components.find((item) => item.kind === RANDOMIZE);
  if (!spec) {
    throw new Error("The engine's library has no Randomize component yet");
  }
  return candidates.flatMap((obj): EditOperation[] => {
    const randomize = component(obj, RANDOMIZE);
    if (randomize) {
      return set(obj, randomize, (setting) => setting.on);
    }
    const properties = Object.fromEntries(spec.properties.map((schema) => [schema.id, schema.default]));
    for (const setting of kind.settings) {
      properties[setting.property] = setting.on;
    }
    const componentId = nextComponentId(
      obj.components.map((item) => item.id),
      RANDOMIZE,
    );
    return [{ op: "add_component", object: obj.id, component: { id: componentId, kind: RANDOMIZE, properties } }];
  });
}
