import type { SceneDocument } from "./scene-documents.fixture.ts";
import type { SceneObject } from "./scene-port.ts";
import { brainSections, connectomeSections, forearmSections, retargetSections } from "./studio-sections.fixture.ts";

// Sample documents of the brain, body and motion workspaces from the design, used only by the prototype, the gallery and tests.

const NO_GUIDE = { started: false, done: 0, total: 5 } as const;
const guide = (done: number) => ({ started: true, done, total: 5 });

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
