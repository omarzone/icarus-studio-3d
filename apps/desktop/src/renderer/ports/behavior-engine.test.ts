import type { BehaviorComparison, BehaviorTest, BehaviorTestResult } from "@icarus/contracts";
import { describe, expect, it } from "vitest";
import { createBehaviorResults } from "./behavior-engine.ts";
import type { RunRecord } from "./results-views.ts";
import { checkpoint, status } from "./testdata/training-runs.ts";

const record: RunRecord = {
  run: status({ best_step: 50_000 }),
  checkpoints: [checkpoint(0, 0), checkpoint(50_000, 0.7)],
};
const test: BehaviorTest = { id: "standard-starts", name: "Standard starts", starts: [20_000], shifts: [] };

function stored(run: string, step: number): BehaviorTestResult {
  return {
    test,
    run_id: run,
    step,
    ran_at: "2026-11-02T10:00:00Z",
    passed: step > 0,
    has_goal: true,
    path_interval: 0.25,
    passed_share: step > 0 ? 1 : 0,
    fall_share: 0,
    mean_seconds: 4,
    mean_return: 1,
    mean_path_length: 3,
    mean_displacement: 2,
    episodes: [{ seed: 20_000, passed: step > 0, ending: "Reached the goal", seconds: 4, episode_return: 1, path: [] }],
  };
}

function fakeEngine() {
  const results: BehaviorTestResult[] = [];
  const ran: string[] = [];
  const comparison = (a: BehaviorTestResult, b: BehaviorTestResult): BehaviorComparison => ({
    test_id: test.id,
    a,
    b,
    rows: [{ label: "Passed", unit: "%", a: 0, b: 100, close: false }],
    path_gap: 1.5,
    similarity: 0.5,
  });
  const behavior = {
    tests: async () => [test],
    addTest: async () => test,
    runTest: async (run: string, step: number) => {
      ran.push(`${run}:${step}`);
      const made = stored(run, step);
      results.push(made);
      return made;
    },
    results: async (run: string) => results.filter((result) => result.run_id === run),
    compare: async () => {
      const [a, b] = results;
      if (!a || !b) {
        throw new Error("not run");
      }
      return comparison(a, b);
    },
    activations: () => Promise.reject(new Error("unused")),
    recording: () => Promise.reject(new Error("unused")),
  };
  const port = createBehaviorResults(
    { records: async () => [record], compared: () => ["run-3"] },
    { rollout: () => Promise.reject(new Error("unused")), runScene: () => Promise.reject(new Error("unused")) },
    behavior,
  );
  return { port, ran };
}

describe("behavior tests on the engine", () => {
  it("runs the selected test on both judged checkpoints and only then compares them", async () => {
    const { port, ran } = fakeEngine();
    expect((await port.getBehaviorMatch("p")).rows).toEqual([]);
    expect((await port.getReferenceTests("p")).tests[0]?.state).toBe("not-run");

    const after = await port.runReferenceTest("p");
    expect(ran).toEqual(["run-3:0", "run-3:50000"]);
    expect(after.tests[0]?.state).toBe("pass");
    const match = await port.getBehaviorMatch("p");
    expect(match.columns).toEqual(["Run 3 · 0", "Run 3 · 50k"]);
    expect(match.rows[0]).toEqual({ behavior: "Passed", a: "0%", b: "100%", verdict: "off" });
    expect(match.note).toBe("Paths 50% alike · 1.50 m apart on average");
    const comparison = await port.getReferenceComparison({ project: "p", test: test.id });
    expect(comparison.sides.map((side) => side.detail)).toEqual(["0 of 1 passed", "1 of 1 passed"]);
  });
});
