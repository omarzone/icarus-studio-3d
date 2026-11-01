import type { SceneDescription } from "@icarus/contracts";
import { pending } from "../app/runtime/pending.ts";
import { definePort } from "../app/runtime/port.tsx";
import { engineApi } from "../engine-client/engine-api.ts";
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

// The 12 property types of the style guide, each with exactly one control.
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
  | "readonly";

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
  | { type: "readonly"; value: string };

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
    };

export type PropertyEdit = { scene: string; section: string; property: string; value: PropertyValue };

export type ComponentKind = { id: string; label: string; icon: SceneIcon };
export type ComponentGroup = { label: string; kinds: readonly ComponentKind[] };

export type Variation = { id: string; label: string; enabled: boolean; detail: string };

export type TrainingCopies = {
  copies: number;
  layout: string;
  layouts: readonly string[];
  variations: readonly Variation[];
};

// Progress of the getting-started guide for the project.
export type GuideProgress = { started: boolean; done: number; total: number };

export type PropertyReference = {
  types: readonly { type: PropertyType; label: string; tag?: string; use: string; sample: Property }[];
  states: readonly { state: PropertyState; label: string; use: string; sample: Property }[];
};

export type ScenePort = {
  getTree: (scene: string) => Promise<SceneTree>;
  selectObject: (input: { scene: string; id: string }) => Promise<SceneTree>;
  getInspection: (scene: string) => Promise<Inspection>;
  setProperty: (edit: PropertyEdit) => Promise<Inspection>;
  resetProperty: (input: { scene: string; section: string; property: string }) => Promise<Inspection>;
  acceptProposedValue: (input: { scene: string; section: string; property: string }) => Promise<Inspection>;
  listComponentKinds: () => Promise<ComponentGroup[]>;
  addComponent: (input: { scene: string; kind: string }) => Promise<Inspection>;
  getTrainingCopies: (scene: string) => Promise<TrainingCopies>;
  setTrainingCopies: (input: { scene: string; copies: number; layout: string }) => Promise<TrainingCopies>;
  toggleVariation: (input: { scene: string; id: string }) => Promise<TrainingCopies>;
  getGuide: (scene: string) => Promise<GuideProgress>;
  getPropertyReference: () => Promise<PropertyReference>;
  // The compiled scene the viewport draws; null where there is no engine scene (prototype).
  getSceneDescription: (scene: string) => Promise<SceneDescription | null>;
  // Moves an object by a delta in world axes (metres, MuJoCo frame), as a gizmo drag ends.
  moveObject: (input: { scene: string; id: string; delta: [number, number, number] }) => Promise<Inspection>;
};

export const scenePort = definePort<ScenePort>({
  app: {
    ...createEngineScenePort(engineApi),
    acceptProposedValue: pending({
      key: "scene.acceptProposedValue",
      summary: "Accepting a value the copilot proposed",
      sprint: 6,
      ids: ["REF-PROPERTY-TYPES"],
    }),
    // Variations per copy arrive with randomized training.
    toggleVariation: pending({
      key: "scene.toggleVariation",
      summary: "Changing what varies between copies",
      sprint: 5,
      ids: ["POP-TRAINING-COPIES"],
    }),
  },
  prototype: createSceneFixture,
});
