import { definePort } from "../app/runtime/port.tsx";
import { engineApi } from "../engine-client/engine-api.ts";
import { createBuildProgressFixture } from "./build-progress.fixture.ts";
import { withCopilot } from "./copilot-connection.ts";
import { buildProgressView } from "./ideas-views.ts";

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
  // The project once the engine has created it.
  projectId: string | null;
  // Why the build stopped, in words.
  error: string | null;
};

export type BuildProgressPort = {
  // The build the key names: a build id in the app, a sample scene in the prototype.
  getBuild: (key: string) => Promise<BuildProgress>;
};

export const buildProgressPort = definePort<BuildProgressPort>({
  app: {
    getBuild: async (key) => buildProgressView(await withCopilot(engineApi.build(key))),
  },
  prototype: createBuildProgressFixture,
});
