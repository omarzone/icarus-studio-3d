import { JOINT_SECTIONS } from "./joint-sections.fixture.ts";
import type { GuideProgress, Inspection, InspectorSection, SceneTree, TrainingCopies } from "./scene-port.ts";

// Sample project documents from the design, used only by the prototype, the design gallery and tests.
export type SceneDocument = {
  tree: SceneTree;
  inspections: Readonly<Record<string, Inspection>>;
  copies?: TrainingCopies;
  guide: GuideProgress;
};

const workspaceRows = (meta: { terrain: string; sky: string; light: string; camera?: string }) => [
  { id: "camera", name: "Camera", icon: "camera", meta: meta.camera, depth: 0 } as const,
  { id: "terrain", name: "Terrain", icon: "terrain", meta: meta.terrain, depth: 0 } as const,
  { id: "sky", name: "Sky", icon: "sky", meta: meta.sky, depth: 0 } as const,
  { id: "lighting", name: "Lighting", icon: "sun", meta: meta.light, depth: 0 } as const,
];

const parkingLotSections: readonly InspectorSection[] = [
  {
    id: "training",
    title: "Training",
    properties: [
      { id: "copies", label: "Copies", state: "default", type: "count", value: 16, min: 1, max: 64 },
      {
        id: "layout",
        label: "Layout",
        state: "default",
        type: "list",
        value: "Grid 4 × 4",
        options: [
          { value: "Grid 4 × 4", label: "Grid 4 × 4", icon: "grid" },
          { value: "Row of 16", label: "Row of 16", icon: "lines" },
          { value: "Scattered", label: "Scattered", icon: "shuffle" },
        ],
      },
      {
        id: "randomize",
        label: "Randomize",
        state: "default",
        type: "panel",
        value: "Positions, colors",
        panel: "training-copies",
      },
    ],
  },
  {
    id: "surface",
    title: "Surface",
    properties: [
      {
        id: "material",
        label: "Material",
        state: "default",
        type: "list",
        value: "Asphalt",
        options: [
          { value: "Asphalt", label: "Asphalt", swatch: { kind: "color", value: "#3d4247" } },
          { value: "Concrete", label: "Concrete", swatch: { kind: "color", value: "#8b9098" } },
          { value: "Gravel", label: "Gravel", swatch: { kind: "color", value: "#6b6458" } },
        ],
      },
      {
        id: "friction",
        label: "Friction",
        state: "changed",
        was: "1.0",
        hint: "How much the tires grip the ground",
        type: "slider",
        value: 0.9,
        min: 0,
        max: 2,
        step: 0.1,
      },
    ],
  },
];

const skySections: readonly InspectorSection[] = [
  {
    id: "sky",
    title: "Sky",
    properties: [
      {
        id: "preset",
        label: "Preset",
        state: "default",
        type: "list",
        value: "Clear day",
        options: [
          { value: "Clear day", label: "Clear day", swatch: { kind: "gradient", from: "#5f8fc4", to: "#e4ecef" } },
          { value: "Dusk", label: "Dusk", swatch: { kind: "gradient", from: "#1b2a3d", to: "#aebccb" } },
        ],
      },
      {
        id: "clouds",
        label: "Clouds",
        state: "default",
        type: "choice",
        value: "Light",
        options: ["None", "Light", "Heavy"],
      },
      { id: "horizon", label: "Horizon", state: "default", type: "color", value: "#AEBCCB" },
    ],
  },
  {
    id: "lighting",
    title: "Lighting",
    properties: [
      {
        id: "time",
        label: "Time of day",
        state: "default",
        type: "slider",
        value: 14.5,
        min: 0,
        max: 24,
        step: 0.25,
        format: "time",
      },
      { id: "sun", label: "Sun intensity", state: "default", type: "slider", value: 1, min: 0, max: 2, step: 0.1 },
      {
        id: "shadows",
        label: "Shadows",
        state: "default",
        type: "choice",
        value: "Soft",
        options: ["Off", "Soft", "Hard"],
      },
    ],
  },
];

export const SCENE_DOCUMENTS: Readonly<Record<string, SceneDocument>> = {
  "park-pilot": {
    tree: {
      selected: "parking-lot",
      sections: [
        { label: "Workspace", objects: workspaceRows({ terrain: "asphalt", sky: "dusk", light: "sun 17:40" }) },
        {
          label: "World",
          objects: [
            { id: "parking-lot", name: "Parking lot", icon: "grid", meta: "× 16 copies", depth: 0 },
            { id: "walls", name: "Walls", icon: "walls", meta: "4", depth: 1 },
            { id: "lines", name: "Lines", icon: "lines", meta: "6 spots", depth: 1 },
            { id: "parked-cars", name: "Parked cars", icon: "car", meta: "5 · random", depth: 1 },
            { id: "free-spot", name: "Free spot", icon: "target", meta: "goal", depth: 1 },
          ],
        },
        { label: "Agents", objects: [{ id: "park-pilot", name: "Park Pilot", icon: "car", meta: "car", depth: 0 }] },
      ],
    },
    inspections: {
      "parking-lot": {
        kind: "object",
        title: "Parking lot",
        subtitle: "Environment · duplicated for training",
        icon: "grid",
        sections: parkingLotSections,
        components: true,
      },
    },
    copies: {
      copies: 16,
      layout: "Grid 4 × 4",
      layouts: ["Grid 4 × 4", "Row of 16", "Scattered"],
      variations: [
        { id: "positions", label: "Parked car positions", enabled: true, detail: "any free spot" },
        { id: "colors", label: "Parked car colors", enabled: true, detail: "8 colors" },
        { id: "time", label: "Time of day", enabled: true, detail: "16:00 – 19:00" },
        { id: "grip", label: "Asphalt grip", enabled: true, detail: "± 10%" },
        { id: "noise", label: "Sensor noise", enabled: true, detail: "± 2 cm" },
        { id: "wind", label: "Wind", enabled: false, detail: "3 m/s gusts" },
      ],
    },
    guide: { started: true, done: 2, total: 5 },
  },
  "new-project": {
    tree: {
      selected: "sky",
      sections: [
        {
          label: "Workspace",
          objects: [
            ...workspaceRows({ terrain: "baseplate", sky: "clear day", light: "sun 14:30", camera: "default" }),
            { id: "spawn", name: "Spawn point", icon: "spawn", depth: 0 },
          ],
        },
        { label: "Agents", objects: [{ id: "add-agent", name: "Add an agent", icon: "add", depth: 0, action: true }] },
      ],
    },
    inspections: {
      sky: {
        kind: "object",
        title: "Sky",
        subtitle: "Default sky and lighting, change anytime",
        icon: "sky",
        sections: skySections,
        components: true,
      },
    },
    guide: { started: false, done: 0, total: 5 },
  },
  "park-pilot-building": {
    tree: {
      selected: null,
      sections: [
        { label: "Workspace", objects: workspaceRows({ terrain: "asphalt", sky: "dusk", light: "sun 17:40" }) },
        { label: "World", objects: [{ id: "parking-lot", name: "Parking lot", icon: "grid", meta: "new", depth: 0 }] },
        { label: "Agents", objects: [{ id: "park-pilot", name: "Park Pilot", icon: "car", meta: "new", depth: 0 }] },
      ],
    },
    inspections: { "": { kind: "building" } },
    guide: { started: false, done: 0, total: 5 },
  },
  "robot-arm": {
    tree: { selected: "joint-3", sections: [] },
    inspections: {
      "joint-3": {
        kind: "object",
        title: "Joint 3 · elbow",
        subtitle: "robot_arm.urdf · imported",
        icon: "box",
        sections: JOINT_SECTIONS,
        components: true,
      },
    },
    guide: { started: false, done: 0, total: 5 },
  },
};
