import type { AutopilotStart, AutopilotStatus } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { autopilot } from "./testdata/coach.ts";
import { createEngineAutopilot } from "./training-autopilot.ts";

// An engine that holds one autopilot per project, as the coach routes do.
function fakeEngine(initial: AutopilotStatus | null = null) {
  let current = initial;
  const started: AutopilotStart[] = [];
  return {
    started,
    api: {
      autopilot: async () => current,
      startAutopilot: async (_project: string, body: AutopilotStart) => {
        started.push(body);
        current = autopilot({ mode: body.mode, iteration: 0, log: [] });
        return current;
      },
      stopAutopilot: async () => {
        current = autopilot({ ...current, state: "stopped" });
        return current;
      },
    },
  };
}

describe("autopilot on the engine", () => {
  it("starts with the mode and limits chosen before", async () => {
    const engine = fakeEngine();
    const port = createEngineAutopilot(engine.api);
    expect(await port.getAutopilot("p")).toMatchObject({ mode: "ask", progress: null });
    await port.setAutopilot({ project: "p", mode: "fix", limits: { goal: 0.9, minutes: 30 } });
    const started = await port.startAutopilot("p");
    expect(engine.started).toEqual([{ mode: "fix", goal_success: 0.9, max_iterations: 4, max_minutes: 30 }]);
    expect(started.progress).toMatchObject({ active: true, label: "Running" });
  });

  it("stops when switched off while it runs, and refuses another mode mid-run", async () => {
    const port = createEngineAutopilot(fakeEngine(autopilot({ mode: "ask" })).api);
    await expect(port.setAutopilot({ project: "p", mode: "fix" })).rejects.toThrow(/Stop the autopilot/);
    const stopped = await port.setAutopilot({ project: "p", mode: "off" });
    expect(stopped).toMatchObject({ mode: "off", progress: { active: false, label: "Stopped" } });
  });
});
