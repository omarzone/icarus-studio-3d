import type { ComponentSpec, EditOperation, LibraryCatalog, Project } from "@icarus/contracts";
import type {
  ActionOutput,
  Learning,
  RewardKind,
  RewardOption,
  RewardTerm,
  SenseInput,
  SensesActions,
} from "./brain-port.ts";

type Family = Project["task"]["family"];
type RewardTermInfo = LibraryCatalog["reward_terms"][number];

// Mirrors the engine's CORE_TERMS: without them a family has nothing to learn toward.
const CORE_TERMS: Readonly<Record<Family, readonly string[]>> = {
  navigation: ["progress_to_goal", "reach_goal"],
  locomotion: ["forward_progress"],
  none: [],
};

// Mirrors the engine's episode rules (sim/env.py): 30 s, ends early on a fall or, navigating, on reaching the goal.
const GOALS: Readonly<Record<Family, Learning["goal"]>> = {
  navigation: {
    success: "Reach the goal zone and stay there",
    timeLimit: "30 s per episode",
    endsWhen: ["It reaches the goal", "It falls", "Time runs out"],
  },
  locomotion: {
    success: "Move forward without falling",
    timeLimit: "30 s per episode",
    endsWhen: ["It falls", "Time runs out"],
  },
  none: { success: "No task chosen yet", timeLimit: "30 s per episode", endsWhen: ["It falls", "Time runs out"] },
};

function propertyOf(component: ComponentSpec, id: string): string | number | null {
  const property = component.properties[id];
  const value = property && "value" in property ? property.value : null;
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function senseDetail(component: ComponentSpec): string | null {
  switch (component.kind) {
    case "distance_ray":
      return `${propertyOf(component, "count") ?? "?"} rays · ${propertyOf(component, "range") ?? "?"} m`;
    case "balance":
      return `${propertyOf(component, "includes") ?? "accel+gyro"}`;
    case "touch":
      return `${propertyOf(component, "radius") ?? "?"} m radius`;
    default:
      return null;
  }
}

// What the brain senses (the body's sensors) and what it moves (the body's motors).
export function sensesActions(project: Project, catalog: LibraryCatalog): SensesActions {
  const senses = new Map(catalog.components.filter((kind) => kind.group === "Senses").map((kind) => [kind.kind, kind]));
  const inputs: SenseInput[] = [];
  const outputs: ActionOutput[] = [];
  for (const obj of project.bodies.flatMap((body) => body.objects)) {
    for (const component of obj.components) {
      const sense = senses.get(component.kind);
      if (sense) {
        const extra = senseDetail(component);
        const detail = extra ? `${obj.name} · ${extra}` : obj.name;
        inputs.push({ id: `${obj.id}/${component.id}`, name: sense.label, detail, enabled: true });
      }
      if (component.kind === "motor") {
        const kind = capitalized(`${propertyOf(component, "kind") ?? "position"}`);
        const force = propertyOf(component, "max_force");
        const detail = force === null ? kind : `${kind} · up to ${force} N`;
        outputs.push({ id: `${obj.id}/${component.id}`, name: obj.name, detail, enabled: true });
      }
    }
  }
  return { inputs, outputs };
}

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
  return { reward, proposedChanges: 0, goal: GOALS[family], curriculum: [] };
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
