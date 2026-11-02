import type { AutoRigProgress, BodyParts, BodyPort, BoneWeights, ImportPreview, RigCheck } from "./body-port.ts";

// Sample body from the design (an imported dancer), used only by the prototype, the gallery and tests.

const POSES = [
  { id: "t-pose", label: "T-pose" },
  { id: "a-pose", label: "A-pose" },
  { id: "video-frame", label: "Frame from video" },
] as const;

const POSE_HINT = "Move any bone to see how the joint limits feel.";

const RIGGED: RigCheck = {
  poseHint: POSE_HINT,
  poses: POSES,
  checks: [
    { text: "Every bone has a joint and a motor", tone: "ok" },
    { text: "Stands for 5 s in a physics test", tone: "ok" },
    { text: "Left and right hands: no colliders", tone: "warn" },
  ],
};

const FAILED: RigCheck = {
  poseHint: POSE_HINT,
  poses: POSES,
  checks: [
    { text: "Every bone has a joint and a motor", tone: "ok" },
    { text: "Falls after 1.4 s in the stand-up test", tone: "warn" },
    { text: "Left knee bends backward: range 0° … 210°", tone: "warn" },
  ],
};

const FIXED: RigCheck = {
  poseHint: POSE_HINT,
  poses: POSES,
  checks: [
    { text: "Every bone has a joint and a motor", tone: "ok" },
    { text: "Stands for 5 s in a physics test", tone: "ok" },
    { text: "Every joint bends the natural way", tone: "ok" },
  ],
};

const WEIGHTS: BoneWeights = {
  bones: [
    { id: "hips", name: "Hips", coverage: 1 },
    { id: "spine", name: "Spine · chest", coverage: 1 },
    { id: "left-forearm", name: "Left forearm", coverage: 0.96 },
    { id: "right-forearm", name: "Right forearm", coverage: 0.95 },
    { id: "hands", name: "Hands", coverage: 0.71, problem: "Fingers pull the wrist skin" },
  ],
};

const IMPORT: ImportPreview = {
  kinds: [
    { id: "model", label: "Model or character" },
    { id: "environment", label: "Environment" },
    { id: "robot", label: "Robot (URDF, MJCF)" },
  ],
  kind: "model",
  file: { name: "dancer.glb", facts: "24k triangles · 1.72 m tall", detected: "Humanoid detected" },
  steps: [
    "Detect the body shape",
    "Place 19 bones and joints",
    "Estimate masses and motor strength",
    "Run a physics check before you use it",
  ],
  formats: "Supports .glb .gltf .fbx .obj for models, .usd and .glb for environments, .urdf and .mjcf for robots.",
};

const AUTO_RIG: AutoRigProgress = {
  file: "dancer.glb",
  percent: 70,
  steps: [
    { text: "Read dancer.glb · 24k triangles", state: "done" },
    { text: "Detect body shape · humanoid", state: "done" },
    { text: "Place 19 bones and joints", state: "done" },
    { text: "Estimate masses and motor strength", state: "running" },
    { text: "Stand-up physics test", state: "todo" },
  ],
};

const PARTS: readonly BodyParts[] = [
  {
    id: "dancer",
    name: "Dancer",
    parts: 19,
    joints: [
      { id: "left-knee", part: "Left knee", kind: "hinge", range: "0° … 150°", motor: "position · 120 N" },
      { id: "right-knee", part: "Right knee", kind: "hinge", range: "0° … 150°", motor: "position · 120 N" },
    ],
    sensors: [{ id: "hips/balance", part: "Hips", label: "Balance" }],
  },
];

const RIG_CHECKS: Readonly<Record<string, RigCheck>> = { "dance-copy": RIGGED, "dance-copy-failed": FAILED };

// In-memory body that behaves: fixing fixes the checks, auto-fix fills the weights, the import kind switches.
export function createBodyFixture(): BodyPort {
  const checks = new Map<string, RigCheck>(Object.entries(RIG_CHECKS));
  let weights = WEIGHTS;
  let preview = IMPORT;
  return {
    getRigCheck: async (body) => checks.get(body) ?? RIGGED,
    getParts: async () => PARTS,
    applyPose: async () => undefined,
    fixProblems: async (body) => {
      checks.set(body, FIXED);
      return FIXED;
    },
    getWeights: async () => weights,
    autoFixWeights: async () => {
      weights = { bones: weights.bones.map((bone) => ({ ...bone, coverage: 1, problem: undefined })) };
      return weights;
    },
    getImport: async () => preview,
    setImportKind: async ({ kind }) => {
      preview = { ...preview, kind };
      return preview;
    },
    importStatic: async () => undefined,
    importAndRig: async () => undefined,
    getAutoRig: async () => AUTO_RIG,
    cancelAutoRig: async () => undefined,
  };
}
