import type { BehaviorTestResult } from "@icarus/contracts";
import { type BehaviorApi, behaviorApi } from "../engine-client/behavior-api.ts";
import type { EngineApi } from "../engine-client/engine-api.ts";
import { compactNumber } from "../ui/compact-number.ts";
import {
  behaviorMatchView,
  type Judged,
  judgedCheckpoints,
  neuronLayers,
  recordingsView,
  referenceComparisonView,
  referenceSummary,
  referenceTestsView,
  resultOf,
  timelapseView,
} from "./behavior-views.ts";
import { replayFrames } from "./replay-views.ts";
import type { ResultSummary, ResultsPort } from "./results-port.ts";
import type { RunRecord } from "./results-views.ts";

// Behavior tests, recordings, the timelapse and neuron activity on the engine, for the Results port.

export type BehaviorResultsPort = Pick<
  ResultsPort,
  | "getTimelapse"
  | "selectTimelapseFrame"
  | "getRecordingReplay"
  | "exportRecording"
  | "getReferenceTests"
  | "selectReferenceTest"
  | "runReferenceTest"
  | "addReferenceTest"
  | "listRecordings"
  | "getReferenceComparison"
  | "getBehaviorMatch"
  | "getNeurons"
> & { referenceSummary: (project: string) => Promise<ResultSummary> };

type Sources = {
  records: (project: string) => Promise<RunRecord[]>;
  compared: (project: string, records: readonly RunRecord[]) => string[];
};

type ReplayApi = Pick<EngineApi, "rollout" | "runScene">;

export function createBehaviorResults(
  sources: Sources,
  api: ReplayApi,
  behavior: Pick<
    BehaviorApi,
    "tests" | "addTest" | "runTest" | "results" | "compare" | "activations" | "recording"
  > = behaviorApi,
): BehaviorResultsPort {
  const selectedTest = new Map<string, string>();
  const selectedFrame = new Map<string, string>();

  const judged = async (project: string): Promise<Judged[]> => {
    const list = await sources.records(project);
    return judgedCheckpoints(list, sources.compared(project, list));
  };

  const resultsOf = async (sides: readonly Judged[]): Promise<BehaviorTestResult[]> => {
    const runs = [...new Set(sides.map((side) => side.run))];
    return (await Promise.all(runs.map((run) => behavior.results(run)))).flat();
  };

  const referenceTests = async (project: string) => {
    const [tests, sides] = await Promise.all([behavior.tests(project), judged(project)]);
    return referenceTestsView(tests, await resultsOf(sides), sides, selectedTest.get(project));
  };

  // The selected test, its judged checkpoints and their stored results.
  const selection = async (project: string, testId?: string) => {
    const [tests, sides] = await Promise.all([behavior.tests(project), judged(project)]);
    const chosen = testId ?? selectedTest.get(project);
    const test = tests.find((item) => item.id === chosen) ?? tests[0];
    const results = await resultsOf(sides);
    return { test, sides, found: sides.map((side) => (test ? resultOf(results, test, side) : undefined)) };
  };

  return {
    getTimelapse: async (project) => timelapseView(await sources.records(project), selectedFrame.get(project)),
    selectTimelapseFrame: async ({ project, id }) => {
      selectedFrame.set(project, id);
      return timelapseView(await sources.records(project), id);
    },
    getRecordingReplay: async ({ run, step }) => {
      const [rollout, scene] = await Promise.all([api.rollout(run, step), api.runScene(run)]);
      const first = rollout.frames[0]?.time ?? 0;
      return {
        scene,
        label: `Checkpoint ${compactNumber(step)}`,
        outcome: rollout.outcome,
        duration: Math.max(0, (rollout.frames.at(-1)?.time ?? first) - first),
        frames: replayFrames(rollout),
      };
    },
    exportRecording: ({ run, step }) => behavior.recording(run, step),
    getReferenceTests: referenceTests,
    selectReferenceTest: async ({ project, id }) => {
      selectedTest.set(project, id);
      return referenceTests(project);
    },
    runReferenceTest: async (project) => {
      const { test, sides } = await selection(project);
      if (!test || sides.length === 0) {
        throw new Error("Train a run first: behavior tests judge its checkpoints");
      }
      for (const side of sides) {
        await behavior.runTest(side.run, side.step, test.id);
      }
      return referenceTests(project);
    },
    addReferenceTest: async (project) => {
      const count = (await behavior.tests(project)).length;
      const added = await behavior.addTest(project, { name: `New starts ${count}` });
      selectedTest.set(project, added.id);
      return referenceTests(project);
    },
    listRecordings: async (project) => recordingsView(await sources.records(project)),
    getReferenceComparison: async ({ project, test }) => {
      const { test: chosen, sides, found } = await selection(project, test);
      if (!chosen) {
        throw new Error("This project has no behavior test");
      }
      return referenceComparisonView(
        chosen,
        sides.map((side, index) => ({ side, result: found[index] })),
      );
    },
    getBehaviorMatch: async (project) => {
      const { test, sides, found } = await selection(project);
      const [a, b] = sides;
      if (!test || !a || !b || !found[0] || !found[1]) {
        return behaviorMatchView(sides, null);
      }
      return behaviorMatchView(sides, await behavior.compare(test.id, a, b));
    },
    getNeurons: async (project) => {
      const newest = (await judged(project)).at(-1);
      return newest ? neuronLayers(await behavior.activations(newest.run, newest.step)) : [];
    },
    referenceSummary: async (project) => referenceSummary(await referenceTests(project)),
  };
}
