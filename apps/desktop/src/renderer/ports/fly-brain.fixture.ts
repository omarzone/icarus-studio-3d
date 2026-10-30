import type { Behavior, BrainActivity, BrainSource, Wiring } from "./brain-port.ts";
import type { LiveReadings } from "./progress-step.ts";

// The fruit fly's connectome brain from the design, used only by the prototype, the gallery and tests.

export const FLY_READINGS: LiveReadings = {
  title: "Firing right now",
  rows: [
    { label: "Looming detectors", value: "82%", ratio: 0.82, hot: true },
    { label: "Turn left · DNa02", value: "64%", ratio: 0.64, hot: true },
    { label: "Walking rhythm", value: "90%", ratio: 0.9, hot: false },
    { label: "Grooming", value: "6%", ratio: 0.06, hot: false },
  ],
  caption: "A shadow is coming from the right, so it turns away",
};

export const FLY_SOURCE: BrainSource = {
  title: "Choose the fly’s brain",
  intro: "The body is a physics model of a fruit fly with 6 legs, wings and a head. Pick what drives it.",
  selected: "connectome",
  options: [
    {
      id: "learn",
      title: "Learn a new brain",
      detail: "Icarus trains a small network from scratch with practice (reinforcement learning)",
    },
    {
      id: "connectome",
      title: "Load a connectome",
      detail: "Use a real animal brain map as the wiring, neuron by neuron",
      dataset: {
        name: "FlyWire · adult fruit fly",
        facts: "139,255 neurons · ~50 million synapses · open data",
        fit: "Fits the fly body",
      },
    },
    { id: "community", title: "Start from a community brain", detail: "Remix a brain someone already trained" },
  ],
  connections: [
    { text: "Eye and antenna neurons get the body’s senses", tone: "ok" },
    { text: "Motor neurons drive the leg and wing joints · 92% matched", tone: "ok" },
    { text: "8% of motor neurons have no joint yet, they stay silent", tone: "warn" },
  ],
};

export const FLY_ACTIVITY: BrainActivity = {
  live: true,
  regions: [
    {
      id: "visual",
      name: "Visual system",
      detail: "Turns light into motion and looming signals",
      neurons: 64,
      active: 18,
    },
    { id: "central", name: "Central complex", detail: "Keeps track of heading and steers", neurons: 58, active: 12 },
    { id: "mushroom", name: "Mushroom body", detail: "Learns smells and what they mean", neurons: 56, active: 6 },
    {
      id: "descending",
      name: "Descending neurons",
      detail: "Send commands from the brain to the body",
      neurons: 60,
      active: 14,
    },
    { id: "nerve-cord", name: "Ventral nerve cord", detail: "Runs the leg rhythms of walking", neurons: 64, active: 9 },
  ],
};

export const FLY_BEHAVIORS: Behavior[] = [
  { id: "walk", name: "Walks with a tripod gait", when: "0:02", detail: "Three legs on the floor at a time" },
  { id: "turn", name: "Turns away from a looming shadow", when: "0:07", detail: "DNa02 fires, then it turns left" },
  { id: "groom", name: "Grooms its head", when: "0:15", detail: "Later than recorded flies do" },
];

export const FLY_WIRING: Wiring = {
  unmatched: 8,
  maps: [
    { id: "senses", name: "Senses map", matched: "100%", detail: "Eye and antenna neurons get the body’s senses" },
    { id: "motor", name: "Motor map", matched: "92%", detail: "Motor neurons drive the leg and wing joints" },
  ],
};
