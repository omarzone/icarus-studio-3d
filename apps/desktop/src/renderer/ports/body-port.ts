import { pending } from "../app/runtime/pending.ts";
import { definePort } from "../app/runtime/port.tsx";
import { engineApi } from "../engine-client/engine-api.ts";
import { createBodyFixture } from "./body.fixture.ts";
import { createEngineBodyPort } from "./body-engine.ts";
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

// A body's parts tree summarized: each joint with its range and motor, and the senses it carries.
export type BodyJoint = { id: string; part: string; kind: string; range: string; motor?: string };
export type BodySensor = { id: string; part: string; label: string };
export type BodyParts = {
  id: string;
  name: string;
  parts: number;
  joints: readonly BodyJoint[];
  sensors: readonly BodySensor[];
};

export type AutoRigProgress = { file: string; percent: number; steps: readonly ProgressStep[] };

export type BodyPort = {
  getRigCheck: (body: string) => Promise<RigCheck>;
  getParts: (body: string) => Promise<readonly BodyParts[]>;
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

export const bodyPort = definePort<BodyPort>({
  app: {
    ...createEngineBodyPort(engineApi),
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
