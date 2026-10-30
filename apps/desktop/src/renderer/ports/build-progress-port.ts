import { pending } from "../app/runtime/pending.ts";
import { definePort } from "../app/runtime/port.tsx";
import { createBuildProgressFixture } from "./build-progress.fixture.ts";

// Progress of a project the copilot is generating, step by step.
export type BuildStepStatus = "done" | "running" | "todo";

export type BuildStep = { id: string; label: string; status: BuildStepStatus };

export type BuildProgress = {
  project: string;
  // 0 to 1.
  progress: number;
  steps: readonly BuildStep[];
  // What is happening right now, in words.
  activity: string;
  ready: boolean;
};

export type BuildProgressPort = {
  getBuild: (scene: string) => Promise<BuildProgress>;
};

export const buildProgressPort = definePort<BuildProgressPort>({
  app: {
    getBuild: pending({
      key: "build.progress",
      summary: "Progress of the project being built",
      sprint: 6,
      ids: ["STA-WORLD-BUILDING"],
    }),
  },
  prototype: createBuildProgressFixture,
});
