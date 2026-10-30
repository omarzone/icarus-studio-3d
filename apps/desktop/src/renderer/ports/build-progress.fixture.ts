import type { BuildProgress, BuildProgressPort } from "./build-progress-port.ts";

// Sample build from the design, used only by the prototype, the design gallery and tests.
const BUILDS: Readonly<Record<string, BuildProgress>> = {
  "park-pilot-building": {
    project: "Park Pilot",
    progress: 0.62,
    activity: "Running physics checks on 16 lots…",
    ready: false,
    steps: [
      { id: "understand", label: "Understand the idea", status: "done" },
      { id: "world", label: "Build the world · parking lot", status: "done" },
      { id: "body", label: "Build the body · car with 8 sensors", status: "done" },
      { id: "checks", label: "Physics checks", status: "running" },
      { id: "reward", label: "Set the goal and reward", status: "todo" },
      { id: "ready", label: "Ready to train", status: "todo" },
    ],
  },
};

export function createBuildProgressFixture(): BuildProgressPort {
  return {
    getBuild: async (scene) => {
      const build = BUILDS[scene];
      if (!build) {
        throw new Error(`Nothing is being built for ${scene}`);
      }
      return build;
    },
  };
}
