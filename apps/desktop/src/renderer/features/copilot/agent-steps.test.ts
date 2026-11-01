import { describe, expect, it } from "vitest";
import type { AgentStep } from "../../ports/copilot-port.ts";
import { stepsOverview } from "./agent-steps.ts";

const step = (summary: string, ok = true): AgentStep => ({ tool: "look", summary, ok });

describe("agent steps overview", () => {
  it("shows up to three steps open", () => {
    expect(stepsOverview([step("a"), step("b"), step("c")])).toEqual({
      openAtFirst: true,
      label: "What the copilot did · 3 steps",
    });
  });

  it("folds longer lists and counts what failed", () => {
    expect(stepsOverview([step("a"), step("b", false), step("c"), step("d", false)])).toEqual({
      openAtFirst: false,
      label: "What the copilot did · 4 steps, 2 failed",
    });
  });

  it("says one step in the singular", () => {
    expect(stepsOverview([step("a", false)]).label).toBe("What the copilot did · 1 step, 1 failed");
  });
});
