import type {
  BrainActivations,
  BrainBehaviors,
  BrainNetwork,
  BrainReadings,
  BrainSources,
  EditOperation,
  PlayReading,
} from "@icarus/contracts";
import { compactNumber } from "../ui/compact-number.ts";
import type { Behavior, BrainActivity, BrainRegion, BrainSource, Wiring } from "./brain-port.ts";
import type { CheckFact, LiveReadings } from "./progress-step.ts";

// Pure mappings from a checkpoint's readings, activations and episodes, and from trained brains, onto brain views.

const READINGS_ROWS = 8;
// A neuron counts as active when its output is at least this far from zero (tanh outputs lie in -1..1).
const ACTIVE = 0.5;
// Dots drawn per region at most; the region's name and detail give the exact counts.
const MAX_DOTS = 64;
export const LEARN = "learn";

export type Checkpoint = { runId: string; runName: string; step: number };

function amount(value: number): string {
  const rounded = Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(2).replace(/\.?0+$/, "");
  return rounded === "-0" ? "0" : rounded;
}

function shown(reading: PlayReading): string {
  return reading.unit ? `${amount(reading.value)} ${reading.unit}` : amount(reading.value);
}

function ratioOf(reading: PlayReading): number {
  const span = reading.max - reading.min;
  return span > 0 ? Math.min(1, Math.max(0, (reading.value - reading.min) / span)) : 0;
}

export const NO_READINGS: LiveReadings = {
  title: "What the brain senses",
  rows: [],
  caption: "No trained brain yet: train it to see what it senses and picks",
};

// The senses one second into a test try, the one furthest from the middle of its range marked, then the actions.
export function readingsView(readings: BrainReadings, checkpoint: Checkpoint): LiveReadings {
  const senses = readings.senses.slice(0, READINGS_ROWS);
  const offsets = senses.map((reading) => Math.abs(ratioOf(reading) - 0.5));
  const hottest = offsets.indexOf(Math.max(...offsets));
  const picks = readings.actions.map((action) => `${action.label} ${shown(action)}`).join(", ");
  return {
    title: "What the brain senses",
    rows: senses.map((reading, index) => ({
      label: reading.label,
      value: shown(reading),
      ratio: ratioOf(reading),
      hot: index === hottest,
    })),
    caption: `${amount(readings.seconds)} s into a test try, ${checkpoint.runName} at ${compactNumber(checkpoint.step)} steps picks: ${picks || "nothing to move"}`,
  };
}

function region(id: string, name: string, detail: string, values: readonly number[]): BrainRegion {
  const active = values.filter((value) => Math.abs(value) >= ACTIVE).length;
  const neurons = Math.min(values.length, MAX_DOTS);
  return {
    id,
    name,
    detail: `${detail} · ${active} of ${values.length} active`,
    neurons,
    active: values.length > 0 ? Math.round((active / values.length) * neurons) : 0,
  };
}

// The policy's columns as regions: what reaches it, each hidden layer and the actions, lit by what each computes.
export function activityView(network: BrainNetwork, activations: BrainActivations): BrainActivity {
  const layers = network.layers.map((layer, index) =>
    region(
      `layer-${index + 1}`,
      `${layer.name} · ${layer.size}`,
      `Hidden layer, ${layer.activation}`,
      activations.layers[index] ?? [],
    ),
  );
  return {
    live: false,
    regions: [
      region("inputs", `Senses · ${network.inputs.length}`, "What reaches the brain", activations.observation),
      ...layers,
      region("outputs", `Actions · ${network.outputs.length}`, "What it sets the motors to", activations.outputs),
    ],
  };
}

function when(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) {
    return "";
  }
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function behaviorsView(behaviors: BrainBehaviors): Behavior[] {
  return behaviors.behaviors.map((behavior) => ({
    id: behavior.id,
    name: behavior.name,
    when: when(behavior.seconds),
    detail: behavior.detail,
  }));
}

function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%";
}

// What reaches the brain from the body and what it drives, counting the senses and motors turned off.
export function wiringView(
  senses: { total: number; muted: number },
  motors: { total: number; muted: number },
  actions: number,
): Wiring {
  const maps: Wiring["maps"][number][] = [];
  if (senses.total > 0) {
    const on = senses.total - senses.muted;
    const off = senses.muted > 0 ? `; ${senses.muted} turned off read as zero` : "";
    maps.push({
      id: "senses",
      name: "Senses map",
      matched: percent(on, senses.total),
      detail: `${on} of ${senses.total} sensors feed the brain${off}`,
    });
  }
  if (motors.total > 0) {
    const on = motors.total - motors.muted;
    const off = motors.muted > 0 ? `; ${motors.muted} turned off rest` : "";
    maps.push({
      id: "motor",
      name: "Motor map",
      matched: percent(on, motors.total),
      detail: `The brain drives ${on} of ${motors.total} motors${off}`,
    });
  } else if (actions > 0) {
    maps.push({
      id: "motor",
      name: "Motor map",
      matched: "100%",
      detail: `The brain sets ${actions} actions, such as throttle and steering`,
    });
  }
  return { maps, unmatched: 0 };
}

const sourceId = (runId: string, step: number) => `${runId}@${step}`;

export function sourceView(sources: BrainSources): BrainSource {
  const fitting = sources.options.filter((option) => option.fits);
  const misfits = sources.options.filter((option) => !option.fits);
  const connections: CheckFact[] = [
    { text: `${sources.senses} values from the body's senses reach the brain`, tone: "ok" },
    { text: `The brain sets ${sources.motors} ${sources.motors === 1 ? "action" : "actions"} of the body`, tone: "ok" },
  ];
  const first = misfits[0];
  if (first) {
    const count = `${misfits.length} trained ${misfits.length === 1 ? "brain does" : "brains do"} not fit this body`;
    connections.push({ text: `${count}: ${first.reason ?? "it differs"}`, tone: "warn" });
  }
  const selected = sources.selected;
  return {
    title: "Choose the brain",
    intro: "Pick what drives the body: a new brain that learns with practice, or a brain trained before that fits it.",
    options: [
      { id: LEARN, title: "Learn a new brain", detail: "Train from zero with practice (reinforcement learning)" },
      ...fitting.map((option) => ({
        id: sourceId(option.run_id, option.step),
        title: `${option.run_name} · ${option.project_name}`,
        detail:
          option.success_rate === null || option.success_rate === undefined
            ? `Its best brain, at ${compactNumber(option.step)} steps`
            : `Its best brain, at ${compactNumber(option.step)} steps · ${Math.round(option.success_rate * 100)}% success`,
      })),
    ],
    selected: selected ? sourceId(selected.run_id, selected.step) : LEARN,
    connections,
  };
}

export function sourceOperation(id: string): EditOperation {
  if (id === LEARN) {
    return { op: "set_brain", start_from: "none" };
  }
  const at = id.lastIndexOf("@");
  const step = Number(id.slice(at + 1));
  if (at <= 0 || !Number.isInteger(step) || step < 0) {
    throw new Error("Choose a brain from the list");
  }
  return { op: "set_brain", start_from: { run_id: id.slice(0, at), step } };
}
