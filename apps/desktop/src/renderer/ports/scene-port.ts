import type { SceneDescription } from "@icarus/contracts";
import { definePort } from "../app/runtime/port.tsx";
import { copiesApi, engineApi } from "../engine-client/engine-api.ts";
import { createSceneFixture } from "./scene.fixture.ts";
import { createEngineScenePort } from "./scene-engine.ts";

// View types of the project document the editor shows; the engine implementation maps @icarus/contracts onto them.

// Icon of an object, component or property value; the editor maps each to a Lucide icon.
export type SceneIcon =
  | "add"
  | "agent"
  | "balance"
  | "bone"
  | "bug"
  | "box"
  | "brain"
  | "camera"
  | "car"
  | "collider"
  | "community"
  | "connectome"
  | "dancer"
  | "export"
  | "eye"
  | "film"
  | "goal"
  | "grid"
  | "joint"
  | "lines"
  | "material"
  | "mesh"
  | "motor"
  | "physics"
  | "pose-track"
  | "ray"
  | "retarget"
  | "reward"
  | "shuffle"
  | "sky"
  | "smell"
  | "sound"
  | "spawn"
  | "sun"
  | "target"
  | "terrain"
  | "touch"
  | "transform"
  | "walls"
  | "water"
  | "wind"
  | "wing"
  | "zone";

export type SceneObject = {
  id: string;
  name: string;
  icon: SceneIcon;
  // Short meta on the right ("× 16 copies", "asphalt", "new").
  meta?: string;
  // Nesting level under its section, from 0.
  depth: number;
  // An action row ("Add an agent") instead of an object.
  action?: boolean;
  proposed?: boolean;
};

export type SceneSection = { label: string; objects: readonly SceneObject[] };

export type SceneTree = { selected: string | null; sections: readonly SceneSection[] };

// The 13 property types of the style guide, each with exactly one control.
export type PropertyType =
  | "number"
  | "slider"
  | "range"
  | "choice"
  | "list"
  | "switch"
  | "color"
  | "vector"
  | "count"
  | "asset"
  | "panel"
  | "readonly"
  | "text";

// The 6 states every property can be in.
export type PropertyState = "default" | "changed" | "proposed" | "out-of-range" | "mixed" | "locked";

export type Swatch = { kind: "color"; value: string } | { kind: "gradient"; from: string; to: string };

export type ListOption = { value: string; label: string; icon?: SceneIcon; swatch?: Swatch };

// Surfaces a property can open; each workspace decides where they lead.
export type PropertyPanel = "training-copies" | "brain-sizes" | "randomize" | "autopilot";

export type PropertyValue =
  | { type: "number"; value: number; unit?: string; auto?: boolean }
  | { type: "slider"; value: number; min: number; max: number; step: number; unit?: string; format?: "time" }
  | { type: "range"; low: number; high: number; min: number; max: number; unit?: string }
  | { type: "choice"; value: string; options: readonly string[] }
  | { type: "list"; value: string; options: readonly ListOption[] }
  | { type: "switch"; value: boolean }
  | { type: "color"; value: string }
  | { type: "vector"; value: readonly [number, number, number]; unit?: string }
  | { type: "count"; value: number; min: number; max: number }
  | { type: "asset"; value: string; icon?: SceneIcon }
  | { type: "panel"; value: string; panel: PropertyPanel }
  | { type: "readonly"; value: string }
  | { type: "text"; value: string };

export type Property = {
  id: string;
  label: string;
  state: PropertyState;
  // One-line explanation shown on hover.
  hint?: string;
  // Value before the user changed it ("changed"), shown as "was …".
  was?: string;
  // Why the value is out of range, or how many objects are mixed.
  note?: string;
  // Value proposed by the copilot ("proposed").
  proposed?: PropertyValue;
} & PropertyValue;

export type InspectorSection = {
  id: string;
  title: string;
  icon?: SceneIcon;
  // Note on the right of the section title ("driven by the brain", "2 values").
  note?: string;
  collapsed?: boolean;
  properties: readonly Property[];
};

export type Inspection =
  | { kind: "nothing" }
  | { kind: "building" }
  | {
      kind: "object";
      title: string;
      subtitle: string;
      icon?: SceneIcon;
      sections: readonly InspectorSection[];
      // Only scene objects have components; runs, brains and clips show settings without them.
      components: boolean;
      // An older project's endless floor plane, which the user may turn into a slab with edges.
      planeFloor?: boolean;
    };

export type PropertyEdit = { scene: string; section: string; property: string; value: PropertyValue };

// `unique` kinds fit once per object; the prototype's kinds leave it out.
export type ComponentKind = { id: string; label: string; icon: SceneIcon; unique?: boolean };
export type ComponentGroup = { label: string; kinds: readonly ComponentKind[] };

// `objects` names the world objects that vary, or would once it is on; samples without it list none.
export type Variation = { id: string; label: string; enabled: boolean; detail: string; objects?: readonly string[] };

export type TrainingCopies = {
  copies: number;
  layout: string;
  layouts: readonly string[];
  variations: readonly Variation[];
};

// The getting-started checklist of a project: what it still needs before it can learn.
export type GuideStepId = "body" | "goal" | "rewards" | "trained";

// `training` is true while a run is learning, so the step offers to watch it instead of starting another.
export type GuideStep = { id: GuideStepId; done: boolean; training?: boolean };

// Progress of the getting-started guide; `steps` is the checklist where the engine knows it (the app).
export type GuideProgress = { started: boolean; done: number; total: number; steps?: readonly GuideStep[] };

export type PropertyReference = {
  types: readonly { type: PropertyType; label: string; tag?: string; use: string; sample: Property }[];
  states: readonly { state: PropertyState; label: string; use: string; sample: Property }[];
};

export type ScenePort = {
  getTree: (scene: string) => Promise<SceneTree>;
  selectObject: (input: { scene: string; id: string }) => Promise<SceneTree>;
  // Selects the first object with a component of this kind (the ground, the sky, the sun); null when there is none.
  selectKind: (input: { scene: string; kind: string }) => Promise<SceneTree | null>;
  getInspection: (scene: string) => Promise<Inspection>;
  setProperty: (edit: PropertyEdit) => Promise<Inspection>;
  resetProperty: (input: { scene: string; section: string; property: string }) => Promise<Inspection>;
  acceptProposedValue: (input: { scene: string; section: string; property: string }) => Promise<Inspection>;
  // How the brain practices (steps, copies, network, PPO), edited like a selection that has no components.
  getBrainSettings: (scene: string) => Promise<Inspection>;
  setBrainSetting: (edit: PropertyEdit) => Promise<Inspection>;
  resetBrainSetting: (input: { scene: string; section: string; property: string }) => Promise<Inspection>;
  listComponentKinds: () => Promise<ComponentGroup[]>;
  addComponent: (input: { scene: string; kind: string }) => Promise<Inspection>;
  removeComponent: (input: { scene: string; section: string }) => Promise<Inspection>;
  getTrainingCopies: (scene: string) => Promise<TrainingCopies>;
  setTrainingCopies: (input: { scene: string; copies: number; layout: string }) => Promise<TrainingCopies>;
  toggleVariation: (input: { scene: string; id: string }) => Promise<TrainingCopies>;
  // Each training copy's first episode, as training starts it; empty where there is no engine scene (prototype).
  getCopyScenes: (input: { scene: string; count?: number }) => Promise<SceneDescription[]>;
  getGuide: (scene: string) => Promise<GuideProgress>;
  getPropertyReference: () => Promise<PropertyReference>;
  // The compiled scene the viewport draws; null where there is no engine scene (prototype).
  getSceneDescription: (scene: string) => Promise<SceneDescription | null>;
  // Moves an object by a delta in world axes (metres, MuJoCo frame), as a gizmo drag ends.
  moveObject: (input: { scene: string; id: string; delta: [number, number, number] }) => Promise<Inspection>;
  // Turns an object by a rotation in world axes (quaternion wxyz, MuJoCo frame), as a gizmo drag ends.
  rotateObject: (input: {
    scene: string;
    id: string;
    delta: readonly [number, number, number, number];
  }) => Promise<Inspection>;
  // Stretches an object along its own axes by these factors (1 keeps an axis), as a gizmo drag ends.
  // With a move snap, the stretched sides land on multiples of it.
  scaleObject: (input: {
    scene: string;
    id: string;
    factor: readonly [number, number, number];
    snap?: number | null;
  }) => Promise<Inspection>;
  // Adds a basic part (box, sphere, cylinder, wedge, corner_wedge, capsule) resting on a point, and selects it.
  insertPart: (input: {
    scene: string;
    shape: string;
    at: readonly [number, number, number];
    snap: number | null;
  }) => Promise<SceneTree>;
  // Turns the selected endless floor plane into a ground slab with edges; only when the user asks.
  makeGroundSlab: (scene: string) => Promise<Inspection>;
  renameObject: (input: { scene: string; id: string; name: string }) => Promise<SceneTree>;
  // Copies the object and what is nested in it, and selects the copy.
  duplicateObject: (input: { scene: string; id: string }) => Promise<SceneTree>;
  // Deletes the object and what is nested in it.
  deleteObject: (input: { scene: string; id: string }) => Promise<SceneTree>;
  // Nests the object under another of its group (null: top level), keeping its place in the world.
  reparentObject: (input: { scene: string; id: string; parent: string | null }) => Promise<SceneTree>;
};

export const scenePort = definePort<ScenePort>({
  app: createEngineScenePort({ ...engineApi, ...copiesApi }),
  prototype: createSceneFixture,
});
