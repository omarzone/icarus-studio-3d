import type { ComponentSpec, EditOperation, LibraryCatalog, ObjectSpec, Project } from "@icarus/contracts";
import type {
  ActionOutput,
  Learning,
  RewardKind,
  RewardOption,
  RewardTerm,
  SenseInput,
  SensesActions,
} from "./brain-port.ts";
import { nextComponentId } from "./scene-views.ts";

type Family = Project["task"]["family"];
type RewardTermInfo = LibraryCatalog["reward_terms"][number];

// Mirrors the engine's CORE_TERMS: without them a family has nothing to learn toward.
const CORE_TERMS: Readonly<Record<Family, readonly string[]>> = {
  navigation: ["progress_to_goal", "reach_goal"],
  locomotion: ["forward_progress"],
  imitation: ["track_motion"],
  none: [],
};

const SUCCESS: Readonly<Record<Family, string>> = {
  navigation: "Reach the goal zone and stay there",
  locomotion: "Move forward without falling",
  imitation: "Copy the reference clip without falling",
  none: "No task chosen yet",
};

// Mirrors the engine's episode rules (sim/env.py): the task's seconds, a fall and, navigating, reaching the goal.
function goalOf(task: Project["task"]): Learning["goal"] {
  const endsWhen: string[] = [];
  if (task.family === "navigation" && (task.end_on_success ?? true)) {
    endsWhen.push("It reaches the goal");
  }
  if (task.end_on_fall ?? true) {
    endsWhen.push("It falls");
  }
  if (task.family === "imitation") {
    return {
      success: SUCCESS.imitation,
      timeLimit: "The clip's length per episode",
      endsWhen: [...endsWhen, "The clip ends"],
    };
  }
  endsWhen.push("Time runs out");
  return { success: SUCCESS[task.family], timeLimit: `${task.episode_seconds ?? 30} s per episode`, endsWhen };
}

function propertyOf(component: ComponentSpec, id: string): string | number | null {
  const property = component.properties[id];
  const value = property && "value" in property ? property.value : null;
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Mirrors the engine's ray directions (design/sensors.py): above zero turns left.
export function rayDirection(heading: number): string {
  const degrees = Math.round(((((heading + 180) % 360) + 360) % 360) - 180);
  if (degrees === 0) {
    return "ahead";
  }
  if (Math.abs(degrees) === 180) {
    return "behind";
  }
  return degrees > 0 ? `${degrees}° left` : `${-degrees}° right`;
}

function senseDetail(component: ComponentSpec): string | null {
  switch (component.kind) {
    case "distance_ray": {
      const heading = propertyOf(component, "heading");
      const direction = rayDirection(typeof heading === "number" ? heading : 0);
      const count = propertyOf(component, "count") ?? "?";
      return `${count} ${count === 1 ? "ray" : "rays"} · ${propertyOf(component, "range") ?? "?"} m · ${direction}`;
    }
    case "balance":
      return `${propertyOf(component, "includes") ?? "accel+gyro"}`;
    case "touch":
      return `${propertyOf(component, "radius") ?? "?"} m radius`;
    default:
      return null;
  }
}

// Mirrors the engine's ray names: the name given, else the part's name, numbered after the part's first rays.
function senseName(obj: ObjectSpec, component: ComponentSpec, label: string): string {
  if (component.kind !== "distance_ray") {
    return label;
  }
  const given = `${propertyOf(component, "name") ?? ""}`.trim();
  if (given) {
    return given;
  }
  const order = obj.components.filter((item) => item.kind === "distance_ray").indexOf(component);
  return order === 0 ? `${obj.name} distance` : `${obj.name} distance ${order + 1}`;
}

const LAST_MOTOR = "The brain needs at least one motor to move the body";

// What the brain senses (the body's sensors) and what it moves (the body's motors); turned-off ones stay on the body.
export function sensesActions(project: Project, catalog: LibraryCatalog): SensesActions {
  const mutedSenses = new Set(project.brain.muted_senses ?? []);
  const mutedMotors = new Set(project.brain.muted_motors ?? []);
  const senses = new Map(catalog.components.filter((kind) => kind.group === "Senses").map((kind) => [kind.kind, kind]));
  const inputs: SenseInput[] = [];
  const outputs: ActionOutput[] = [];
  for (const obj of project.bodies.flatMap((body) => body.objects)) {
    for (const component of obj.components) {
      const sense = senses.get(component.kind);
      if (sense) {
        const extra = senseDetail(component);
        inputs.push({
          id: `${obj.id}/${component.id}`,
          name: senseName(obj, component, sense.label),
          detail: extra ? `${obj.name} · ${extra}` : obj.name,
          enabled: !mutedSenses.has(`${obj.id}/${component.id}`),
          renamable: sense.properties.some((schema) => schema.id === "name" && schema.type === "text"),
          removable: true,
        });
      }
      if (component.kind === "motor") {
        const kind = capitalized(`${propertyOf(component, "kind") ?? "position"}`);
        const force = propertyOf(component, "max_force");
        const detail = force === null ? kind : `${kind} · up to ${force} N`;
        outputs.push({
          id: `${obj.id}/${component.id}`,
          name: obj.name,
          detail,
          enabled: !mutedMotors.has(`${obj.id}/${component.id}`),
        });
      }
    }
  }
  const driving = outputs.filter((output) => output.enabled);
  const locked = outputs.map((output) =>
    driving.length === 1 && output.enabled ? { ...output, lockedReason: LAST_MOTOR } : output,
  );
  return { inputs, outputs: locked };
}

// The set_brain operation that turns one sense or motor on or off, sending the whole list the brain leaves out.
export function toggleOperation(project: Project, kind: "senses" | "motors", id: string): EditOperation {
  const muted = (kind === "senses" ? project.brain.muted_senses : project.brain.muted_motors) ?? [];
  const next = muted.includes(id) ? muted.filter((item) => item !== id) : [...muted, id];
  return kind === "senses" ? { op: "set_brain", muted_senses: next } : { op: "set_brain", muted_motors: next };
}

function agentPart(project: Project): ObjectSpec {
  // The agent is the first body's root part, as the engine reads it (sim/model_state.py).
  const root = project.bodies[0]?.objects.find((obj) => obj.parent === null);
  if (!root) {
    throw new Error("Add a body before giving it senses");
  }
  return root;
}

function inputComponent(project: Project, id: string): { obj: ObjectSpec; component: ComponentSpec } {
  const [objectId, componentId] = id.split("/");
  const obj = project.bodies.flatMap((body) => body.objects).find((item) => item.id === objectId);
  const component = obj?.components.find((item) => item.id === componentId);
  if (!obj || !component) {
    throw new Error("That sensor is no longer on the body");
  }
  return { obj, component };
}

// One more ray on the agent's root part: a single ray straight ahead, named so its reading is told apart.
export function addRayOperation(project: Project, catalog: LibraryCatalog): EditOperation {
  const kind = catalog.components.find((item) => item.kind === "distance_ray");
  if (!kind) {
    throw new Error("The library has no distance ray");
  }
  const part = agentPart(project);
  const id = nextComponentId(
    part.components.map((item) => item.id),
    "distance_ray",
  );
  const rays = part.components.filter((item) => item.kind === "distance_ray").length;
  const properties: ComponentSpec["properties"] = Object.fromEntries(
    kind.properties.map((schema) => [schema.id, schema.default]),
  );
  properties.count = { type: "count", value: 1 };
  if (kind.properties.some((schema) => schema.id === "name")) {
    properties.name = { type: "text", value: `Ray ${rays + 1}` };
  }
  return { op: "add_component", object: part.id, component: { id, kind: "distance_ray", properties } };
}

export function removeInputOperation(project: Project, id: string): EditOperation {
  const { obj, component } = inputComponent(project, id);
  return { op: "remove_component", object: obj.id, component: component.id };
}

export function renameInputOperation(project: Project, id: string, name: string): EditOperation {
  const { obj, component } = inputComponent(project, id);
  return {
    op: "set_property",
    object: obj.id,
    component: component.id,
    property: "name",
    value: { type: "text", value: name.trim().slice(0, RAY_NAME_MAX) },
  };
}

// Mirrors the engine's TextValue limit.
const RAY_NAME_MAX = 40;

function termInfo(catalog: LibraryCatalog, term: string): RewardTermInfo | undefined {
  return catalog.reward_terms.find((info) => info.term === term);
}

function kindOf(family: Family, term: string, weight: number, info: RewardTermInfo | undefined): RewardKind {
  if (CORE_TERMS[family].includes(term)) {
    return "goal";
  }
  if (weight >= 0) {
    return "reward";
  }
  // Small per-step nudges (time, energy) are costs; large ones punish mistakes.
  return info && info.weight_min >= -1 ? "cost" : "penalty";
}

// The reward, goal and curriculum of the project's task.
export function learningView(project: Project, catalog: LibraryCatalog): Learning {
  const family = project.task.family;
  const reward: RewardTerm[] = project.task.rewards.map((spec) => {
    const info = termInfo(catalog, spec.term);
    const scale = info ? Math.max(Math.abs(info.weight_min), Math.abs(info.weight_max)) : Math.abs(spec.weight) || 1;
    return {
      id: spec.term,
      name: info?.label ?? spec.term,
      detail: info?.description ?? "",
      weight: spec.weight,
      scale,
      kind: kindOf(family, spec.term, spec.weight, info),
    };
  });
  return { reward, proposedChanges: 0, goal: goalOf(project.task), curriculum: [] };
}

function fits(info: RewardTermInfo, family: Family): boolean {
  const families = info.families && info.families.length > 0 ? info.families : [info.family];
  return families.includes(family);
}

export function rewardOptions(project: Project, catalog: LibraryCatalog): RewardOption[] {
  const used = new Set(project.task.rewards.map((spec) => spec.term));
  return catalog.reward_terms
    .filter((info) => !used.has(info.term) && fits(info, project.task.family))
    .map((info) => ({ term: info.term, name: info.label, detail: info.description, weight: info.default_weight }));
}

export function weightOperation(
  project: Project,
  catalog: LibraryCatalog,
  term: string,
  weight: number,
): EditOperation {
  const spec = project.task.rewards.find((item) => item.term === term);
  if (!spec) {
    throw new Error(`The reward has no ${term}`);
  }
  const info = termInfo(catalog, term);
  const clamped = info ? Math.min(info.weight_max, Math.max(info.weight_min, weight)) : weight;
  return { op: "set_reward_term", term: { ...spec, params: spec.params ?? {}, weight: clamped } };
}

export function addTermOperation(project: Project, catalog: LibraryCatalog, term: string): EditOperation {
  const option = rewardOptions(project, catalog).find((item) => item.term === term);
  if (!option) {
    throw new Error(`${term} does not fit this task`);
  }
  return { op: "set_reward_term", term: { term, weight: option.weight, params: {} } };
}
