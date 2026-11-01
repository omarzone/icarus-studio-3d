import type { InspectorSection } from "./scene-port.ts";

// Inspector settings of the brain, connectome, bone and retarget samples from the design, used only by the prototype, the gallery and tests.

export const brainSections: readonly InspectorSection[] = [
  {
    id: "practice",
    title: "Practice",
    properties: [
      { id: "steps", label: "Steps", state: "default", type: "number", value: 2, unit: "M" },
      { id: "copies", label: "Parallel copies", state: "default", type: "slider", value: 16, min: 1, max: 24, step: 1 },
    ],
  },
  {
    id: "expert",
    title: "Expert settings",
    properties: [
      {
        id: "method",
        label: "Method",
        state: "default",
        type: "list",
        value: "PPO",
        options: [
          { value: "PPO", label: "PPO" },
          { value: "SAC", label: "SAC" },
        ],
      },
      {
        id: "network",
        label: "Network",
        state: "default",
        type: "panel",
        value: "2 layers · 256",
        panel: "brain-sizes",
      },
      {
        id: "learning-rate",
        label: "Learning rate",
        state: "proposed",
        type: "number",
        value: 0.0003,
        auto: true,
        proposed: { type: "number", value: 0.0001 },
      },
    ],
  },
];

export const connectomeSections: readonly InspectorSection[] = [
  {
    id: "wiring",
    title: "Wiring",
    properties: [
      { id: "neurons", label: "Neurons", state: "default", type: "readonly", value: "139,255" },
      { id: "synapses", label: "Synapses", state: "default", type: "readonly", value: "~50 million" },
      {
        id: "model",
        label: "Model",
        state: "default",
        type: "list",
        value: "leaky integrate & fire",
        options: [
          { value: "leaky integrate & fire", label: "leaky integrate & fire" },
          { value: "rate model", label: "rate model" },
        ],
      },
    ],
  },
  {
    id: "simulation",
    title: "Simulation",
    properties: [
      {
        id: "time-step",
        label: "Time step",
        state: "default",
        type: "list",
        value: "0.1 ms",
        options: [
          { value: "0.1 ms", label: "0.1 ms" },
          { value: "0.5 ms", label: "0.5 ms" },
        ],
      },
      { id: "training", label: "Training", state: "default", type: "readonly", value: "None · real wiring" },
    ],
  },
];

export const forearmSections: readonly InspectorSection[] = [
  {
    id: "joint",
    title: "Joint",
    properties: [
      {
        id: "type",
        label: "Type",
        state: "default",
        type: "list",
        value: "Hinge",
        options: [
          { value: "Hinge", label: "Hinge", icon: "joint" },
          { value: "Ball", label: "Ball", icon: "joint" },
          { value: "Fixed", label: "Fixed", icon: "box" },
        ],
      },
      { id: "range", label: "Range", state: "default", type: "range", low: 0, high: 145, min: 0, max: 160, unit: "°" },
      { id: "damping", label: "Damping", state: "default", type: "slider", value: 0.4, min: 0, max: 1, step: 0.1 },
    ],
  },
  {
    id: "motor",
    title: "Motor",
    properties: [
      {
        id: "strength",
        label: "Strength",
        state: "default",
        type: "slider",
        value: 38,
        min: 0,
        max: 72,
        step: 1,
        unit: "N·m",
      },
      {
        id: "speed",
        label: "Speed",
        state: "default",
        type: "slider",
        value: 6,
        min: 0,
        max: 14,
        step: 1,
        unit: "rad/s",
      },
    ],
  },
  {
    id: "body",
    title: "Body",
    properties: [
      { id: "mass", label: "Mass", state: "default", type: "number", value: 1.2, unit: "kg", auto: true },
      {
        id: "collider",
        label: "Collider",
        state: "default",
        type: "list",
        value: "Capsule",
        options: [
          { value: "Capsule", label: "Capsule", icon: "box" },
          { value: "Box", label: "Box", icon: "box" },
          { value: "Mesh", label: "Mesh", icon: "mesh" },
        ],
      },
    ],
  },
];

export const retargetSections: readonly InspectorSection[] = [
  {
    id: "match",
    title: "Match",
    properties: [
      { id: "height", label: "Body height", state: "default", type: "readonly", value: "1.72 m → 1.72 m" },
      { id: "arms", label: "Arms", state: "default", type: "choice", value: "Auto", options: ["Auto", "Manual"] },
      { id: "feet", label: "Feet on floor", state: "default", type: "switch", value: true },
    ],
  },
  {
    id: "physics",
    title: "Physics",
    properties: [
      {
        id: "balance",
        label: "Balance help",
        state: "default",
        type: "choice",
        value: "Medium",
        options: ["Low", "Medium", "High"],
      },
      {
        id: "force",
        label: "Max joint force",
        state: "default",
        type: "slider",
        value: 1,
        min: 0,
        max: 2,
        step: 0.1,
        unit: "×",
      },
    ],
  },
];
