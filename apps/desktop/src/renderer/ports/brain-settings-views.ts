import type {
  EditOperation,
  PropertyValue as EngineValue,
  LibraryCatalog,
  Project,
  PropertySchema,
  SetBrain,
} from "@icarus/contracts";
import { formatPropertyValue } from "./property-format.ts";
import type { Inspection, InspectorSection, Property, PropertyValue } from "./scene-port.ts";
import { toViewValue } from "./scene-views.ts";
import { recommendedSteps } from "./training-views.ts";

type BrainSpec = Project["brain"];
type PpoKey = keyof NonNullable<SetBrain["ppo"]>;

// The PPO knobs the library names "ppo.<field>"; any other id is not one.
const PPO_KEYS: readonly PpoKey[] = [
  "learning_rate",
  "n_steps",
  "batch_size",
  "n_epochs",
  "gamma",
  "gae_lambda",
  "ent_coef",
];
const DEFAULT_LAYERS = [256, 256];

function ppoKey(id: string): PpoKey | undefined {
  return PPO_KEYS.find((key) => `ppo.${key}` === id);
}

function layersOf(brain: BrainSpec): number[] {
  return brain.layers && brain.layers.length > 0 ? brain.layers : DEFAULT_LAYERS;
}

function numberIn(value: PropertyValue): number {
  switch (value.type) {
    case "number":
    case "slider":
    case "count":
      return value.value;
    default:
      throw new Error("This setting takes a number");
  }
}

// What the brain stores for a setting; undefined where the brain keeps the task's recommendation.
function storedNumber(brain: BrainSpec, id: string): number | undefined {
  const key = ppoKey(id);
  if (key) {
    return brain.ppo?.[key];
  }
  switch (id) {
    case "training_steps":
      return brain.training_steps ?? undefined;
    case "copies":
      return brain.copies;
    case "layers":
      return layersOf(brain).length;
    case "neurons":
      return layersOf(brain)[0];
    default:
      return undefined;
  }
}

function numeric(schema: PropertySchema, value: number): EngineValue {
  switch (schema.type) {
    case "count":
      return { type: "count", value };
    case "slider":
      return { type: "slider", value };
    default:
      return { type: "number", value };
  }
}

function settingProperty(project: Project, schema: PropertySchema): Property {
  const brain = project.brain;
  const base = { id: schema.id, label: schema.label, hint: schema.hint ?? undefined };
  if (schema.id === "algorithm") {
    const value = toViewValue(schema, { type: "list", value: brain.algorithm ?? "ppo" });
    return { ...base, state: "default", ...value };
  }
  const layers = layersOf(brain);
  if (schema.id === "neurons" && layers.some((size) => size !== layers[0])) {
    const value = toViewValue(schema, numeric(schema, layers[0] ?? 0));
    return { ...base, state: "mixed", note: layers.join(", "), ...value };
  }
  const stored = storedNumber(brain, schema.id);
  const fallback = "value" in schema.default && typeof schema.default.value === "number" ? schema.default.value : 0;
  if (schema.id === "training_steps" && stored === undefined) {
    // No steps of its own: runs practice the task's recommended budget.
    return { ...base, state: "default", type: "number", value: recommendedSteps(project.task.family), auto: true };
  }
  const number = stored ?? fallback;
  const view = toViewValue(schema, numeric(schema, number));
  const changed = schema.id === "training_steps" || number !== fallback;
  return {
    ...base,
    state: changed ? "changed" : "default",
    was:
      changed && schema.id !== "training_steps" ? formatPropertyValue(toViewValue(schema, schema.default)) : undefined,
    ...view,
  };
}

const PRACTICE = "practice";
const EXPERT = "expert";

// The brain as the inspector shows it: practice first, expert settings folded away.
export function brainInspection(project: Project, catalog: LibraryCatalog): Inspection {
  const settings = catalog.brain_settings ?? [];
  if (settings.length === 0) {
    return { kind: "nothing" };
  }
  const section = (id: string, title: string, expert: boolean): InspectorSection => ({
    id,
    title,
    collapsed: expert,
    properties: settings
      .filter((schema) => Boolean(schema.expert) === expert)
      .map((schema) => settingProperty(project, schema)),
  });
  return {
    kind: "object",
    title: "Brain",
    subtitle: "How it practices",
    icon: "brain",
    sections: [section(PRACTICE, "Practice", false), section(EXPERT, "Expert settings", true)],
    components: false,
  };
}

function schemaOf(catalog: LibraryCatalog, id: string): PropertySchema {
  const schema = catalog.brain_settings?.find((item) => item.id === id);
  if (!schema) {
    throw new Error(`The brain has no setting ${id}`);
  }
  return schema;
}

// The set_brain operation that gives one setting a new value.
export function brainSettingOperation(
  project: Project,
  catalog: LibraryCatalog,
  id: string,
  value: PropertyValue,
): EditOperation {
  schemaOf(catalog, id);
  const key = ppoKey(id);
  if (key) {
    return { op: "set_brain", ppo: { [key]: numberIn(value) } };
  }
  const layers = layersOf(project.brain);
  switch (id) {
    case "training_steps":
      return { op: "set_brain", training_steps: numberIn(value) };
    case "copies":
      return { op: "set_brain", copies: numberIn(value) };
    case "algorithm":
      if (value.type !== "list" || value.value !== "ppo") {
        throw new Error("PPO is the only method that trains");
      }
      return { op: "set_brain", algorithm: value.value };
    case "layers": {
      const count = numberIn(value);
      const last = layers.at(-1) ?? 256;
      return { op: "set_brain", layers: Array.from({ length: count }, (_, index) => layers[index] ?? last) };
    }
    case "neurons":
      return { op: "set_brain", layers: layers.map(() => numberIn(value)) };
    default:
      throw new Error(`The brain has no setting ${id}`);
  }
}

// Back to the library default; steps go back to the task's recommended budget.
export function brainSettingReset(project: Project, catalog: LibraryCatalog, id: string): EditOperation {
  if (id === "training_steps") {
    return { op: "set_brain", training_steps: "recommended" };
  }
  const schema = schemaOf(catalog, id);
  return brainSettingOperation(project, catalog, id, toViewValue(schema, schema.default));
}
