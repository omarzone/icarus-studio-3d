import { pending } from "../app/runtime/pending.ts";
import { definePort } from "../app/runtime/port.tsx";
import { createBodyFixture } from "./body.fixture.ts";
import type { CheckFact, ProgressStep } from "./progress-step.ts";

// View types of the body workspace: the rig's physics checks, test poses, skin weights, import and auto-rig.

export type RigCheck = {
  checks: readonly CheckFact[];
  poseHint: string;
  poses: readonly { id: string; label: string }[];
};

export type BoneWeights = { bones: readonly { id: string; name: string; coverage: number; problem?: string }[] };

export type ImportKind = { id: string; label: string };
export type ImportPreview = {
  kinds: readonly ImportKind[];
  kind: string;
  file: { name: string; facts: string; detected: string };
  steps: readonly string[];
  formats: string;
};

export type AutoRigProgress = { file: string; percent: number; steps: readonly ProgressStep[] };

export type BodyPort = {
  getRigCheck: (body: string) => Promise<RigCheck>;
  applyPose: (input: { body: string; id: string }) => Promise<void>;
  fixProblems: (body: string) => Promise<RigCheck>;
  getWeights: (body: string) => Promise<BoneWeights>;
  autoFixWeights: (body: string) => Promise<BoneWeights>;
  getImport: (body: string) => Promise<ImportPreview>;
  setImportKind: (input: { body: string; kind: string }) => Promise<ImportPreview>;
  importStatic: (body: string) => Promise<void>;
  importAndRig: (body: string) => Promise<void>;
  getAutoRig: (body: string) => Promise<AutoRigProgress>;
  cancelAutoRig: (body: string) => Promise<void>;
};

const rig = ["SCR-BODY", "STA-BODY-CHECK-FAILED", "MOD-AUTO-RIG"] as const;

export const bodyPort = definePort<BodyPort>({
  app: {
    getRigCheck: pending({ key: "body.rigCheck", summary: "The physics checks of the body", sprint: 9, ids: [...rig] }),
    applyPose: pending({ key: "body.applyPose", summary: "Trying a test pose", sprint: 9, ids: ["SCR-BODY"] }),
    fixProblems: pending({
      key: "body.fixProblems",
      summary: "Fixing the problems in the body",
      sprint: 9,
      ids: ["STA-BODY-CHECK-FAILED"],
    }),
    getWeights: pending({ key: "body.weights", summary: "Skin weights per bone", sprint: 9, ids: ["SCR-BODY"] }),
    autoFixWeights: pending({
      key: "body.autoFixWeights",
      summary: "Fixing skin weights automatically",
      sprint: 9,
      ids: ["SCR-BODY"],
    }),
    getImport: pending({ key: "body.import", summary: "Reading a model to import", sprint: 9, ids: ["MOD-IMPORT"] }),
    setImportKind: pending({
      key: "body.setImportKind",
      summary: "Choosing what kind of file to import",
      sprint: 9,
      ids: ["MOD-IMPORT"],
    }),
    importStatic: pending({
      key: "body.importStatic",
      summary: "Importing a model as a static mesh",
      sprint: 9,
      ids: ["MOD-IMPORT"],
    }),
    importAndRig: pending({
      key: "body.importAndRig",
      summary: "Importing and auto-rigging a model",
      sprint: 9,
      ids: ["MOD-IMPORT"],
    }),
    getAutoRig: pending({ key: "body.autoRig", summary: "Auto-rig progress", sprint: 9, ids: ["MOD-AUTO-RIG"] }),
    cancelAutoRig: pending({
      key: "body.cancelAutoRig",
      summary: "Cancelling the auto-rig",
      sprint: 9,
      ids: ["MOD-AUTO-RIG"],
    }),
  },
  prototype: createBodyFixture,
});
