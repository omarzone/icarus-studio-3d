import type { SceneDocument } from "./scene-documents.fixture.ts";
import type { InspectorSection, SceneObject } from "./scene-port.ts";

// Sample documents of the brain, body and motion workspaces from the design, used only by the prototype, the gallery and tests.

const NO_GUIDE = { started: false, done: 0, total: 5 } as const;
const guide = (done: number) => ({ started: true, done, total: 5 });

const brainSections: readonly InspectorSection[] = [
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

const connectomeSections: readonly InspectorSection[] = [
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

const forearmSections: readonly InspectorSection[] = [
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

const retargetSections: readonly InspectorSection[] = [
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

const rigRows: readonly SceneObject[] = [
  { id: "skeleton", name: "Skeleton", icon: "bone", meta: "19 bones", depth: 0 },
  { id: "hips", name: "Hips", icon: "bone", depth: 1 },
  { id: "spine", name: "Spine · chest", icon: "bone", depth: 1 },
  { id: "left-arm", name: "Left arm", icon: "bone", depth: 1 },
  { id: "left-forearm", name: "Left forearm", icon: "joint", meta: "hinge", depth: 2 },
  { id: "right-arm", name: "Right arm", icon: "bone", depth: 1 },
  { id: "legs", name: "Legs", icon: "bone", meta: "6 bones", depth: 1 },
];

const rigTree = {
  selected: "left-forearm",
  sections: [
    { label: "Dancer · imported dancer.glb", objects: rigRows },
    {
      label: "Physics",
      objects: [
        { id: "motors", name: "Motors", icon: "motor", meta: "17", depth: 0 },
        { id: "sensors", name: "Sensors", icon: "ray", meta: "IMU · 2 feet", depth: 0 },
        { id: "colliders", name: "Colliders", icon: "collider", meta: "auto", depth: 0 },
      ],
    },
  ],
} as const;

const forearm = {
  kind: "object",
  title: "Left forearm",
  subtitle: "Bone · hinge joint · from dancer.glb",
  icon: "joint",
  sections: forearmSections,
  components: true,
} as const;

export const STUDIO_SCENE_DOCUMENTS: Readonly<Record<string, SceneDocument>> = {
  "park-pilot-brain": {
    tree: { selected: "brain", sections: [] },
    inspections: {
      brain: { kind: "object", title: "Brain", subtitle: "How it learns", sections: brainSections, components: false },
    },
    guide: guide(4),
  },
  "fruit-fly": {
    tree: {
      selected: "connectome",
      sections: [
        {
          label: "Fruit fly · body",
          objects: [
            { id: "body", name: "Body", icon: "bug", meta: "flybody · MuJoCo", depth: 0 },
            { id: "legs", name: "Legs", icon: "bone", meta: "6", depth: 1 },
            { id: "wings", name: "Wings", icon: "wing", meta: "2", depth: 1 },
            { id: "eyes", name: "Eyes", icon: "eye", meta: "compound", depth: 1 },
          ],
        },
        {
          label: "Brain · connectome",
          objects: [
            { id: "connectome", name: "FlyWire connectome", icon: "brain", meta: "139,255", depth: 0 },
            { id: "visual", name: "Visual system", icon: "eye", depth: 1 },
            { id: "central", name: "Central complex", icon: "connectome", depth: 1 },
            { id: "descending", name: "Descending neurons", icon: "connectome", depth: 1 },
            { id: "motor-map", name: "Motor map", icon: "motor", meta: "auto-matched", depth: 0 },
          ],
        },
      ],
    },
    inspections: {
      connectome: {
        kind: "object",
        title: "FlyWire connectome",
        subtitle: "Adult fruit fly · whole brain",
        icon: "brain",
        sections: connectomeSections,
        components: false,
      },
    },
    guide: NO_GUIDE,
  },
  "dance-copy-rig": { tree: rigTree, inspections: { "left-forearm": forearm }, guide: guide(3) },
  "dance-copy-new": {
    tree: {
      selected: null,
      sections: [
        {
          label: "Workspace",
          objects: [
            { id: "camera", name: "Camera", icon: "camera", depth: 0 },
            { id: "terrain", name: "Terrain", icon: "terrain", depth: 0 },
            { id: "sky", name: "Sky", icon: "sky", depth: 0 },
            { id: "lighting", name: "Lighting", icon: "sun", depth: 0 },
          ],
        },
      ],
    },
    inspections: {
      "": { kind: "object", title: "Workspace", subtitle: "Nothing selected", sections: [], components: false },
    },
    guide: guide(1),
  },
  "dance-copy-clip": {
    tree: {
      selected: "salsa",
      sections: [
        {
          label: "Clip",
          objects: [
            { id: "salsa", name: "salsa.mp4", icon: "film", meta: "12 s", depth: 0 },
            { id: "pose-track", name: "Pose track", icon: "pose-track", meta: "360 frames", depth: 0 },
            { id: "retarget-map", name: "Retarget map", icon: "retarget", meta: "19 bones", depth: 0 },
          ],
        },
        {
          label: "Character",
          objects: [{ id: "dancer", name: "Dancer", icon: "dancer", meta: "dancer.glb", depth: 0 }],
        },
        {
          label: "Exports",
          objects: [{ id: "export", name: "salsa-physics.glb", icon: "export", meta: "draft", depth: 0 }],
        },
      ],
    },
    inspections: {
      salsa: {
        kind: "object",
        title: "Retarget",
        subtitle: "How the video maps onto your dancer",
        sections: retargetSections,
        components: false,
      },
    },
    guide: guide(3),
  },
};
