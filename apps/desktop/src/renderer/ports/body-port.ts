import type { SceneDescription } from "@icarus/contracts";
import { definePort } from "../app/runtime/port.tsx";
import { engineApi } from "../engine-client/engine-api.ts";
import { rigApi } from "../engine-client/rig-api.ts";
import { robotApi } from "../engine-client/robot-api.ts";
import { skinApi } from "../engine-client/skin-api.ts";
import { createBodyFixture } from "./body.fixture.ts";
import { createEngineBodyPort } from "./body-engine.ts";
import type { CheckFact, ProgressStep } from "./progress-step.ts";

// View types of the body workspace: the rig's physics checks, test poses, skin weights, import and auto-rig.

export type RigCheck = {
  checks: readonly CheckFact[];
  // Failing design tests and audit findings: what keeps the body from training well, never a test not run.
  problems: number;
  // Failing design tests alone: the store refuses the body until they pass, so training waits for them.
  blocking: number;
  poseHint: string;
  poses: readonly { id: string; label: string }[];
};

// A test pose as MuJoCo left it after the motors held it: what it found, and the posed body to look at (none in the
// prototype, which has no engine).
export type PosePreview = { label: string; facts: readonly CheckFact[]; scene: SceneDescription | null };

export type BoneWeights = { bones: readonly { id: string; name: string; coverage: number; problem?: string }[] };

export type ImportKind = { id: string; label: string };
// A model file the person picked, read as base64.
export type ModelFile = { name: string; data: string };
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

export type AutoRigProgress = {
  file: string;
  percent: number;
  steps: readonly ProgressStep[];
  state: "running" | "done" | "failed" | "stopped";
  // Why it failed or stopped, in words.
  message?: string;
};

export type BodyPort = {
  getRigCheck: (body: string) => Promise<RigCheck>;
  getParts: (body: string) => Promise<readonly BodyParts[]>;
  applyPose: (input: { body: string; id: string }) => Promise<PosePreview>;
  fixProblems: (body: string) => Promise<RigCheck>;
  getWeights: (body: string) => Promise<BoneWeights>;
  autoFixWeights: (body: string) => Promise<BoneWeights>;
  getImport: (body: string) => Promise<ImportPreview>;
  setImportKind: (input: { body: string; kind: string }) => Promise<ImportPreview>;
  importStatic: (input: { body: string; kind: string; file: ModelFile | null }) => Promise<void>;
  importAndRig: (input: { body: string; kind: string; file: ModelFile | null }) => Promise<void>;
  // A URDF or MJCF robot with its meshes, made the body as it is: its joints and motors come from the file.
  importRobot: (input: { body: string; files: readonly ModelFile[] }) => Promise<void>;
  getAutoRig: (body: string) => Promise<AutoRigProgress>;
  cancelAutoRig: (body: string) => Promise<void>;
};

export const bodyPort = definePort<BodyPort>({
  app: createEngineBodyPort(engineApi, skinApi, rigApi, robotApi),
  prototype: createBodyFixture,
});
