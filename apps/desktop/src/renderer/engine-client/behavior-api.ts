import type {
  BehaviorComparison,
  BehaviorTest,
  BehaviorTestDraft,
  BehaviorTestResult,
  CheckpointEpisode,
  EpisodeActivations,
} from "@icarus/contracts";
import {
  isBehaviorComparison,
  isBehaviorTest,
  isBehaviorTestResult,
  isBehaviorTestResults,
  isBehaviorTests,
  isCheckpointEpisodes,
  isEpisodeActivations,
} from "./behavior-checks.ts";
import { request, requestFile } from "./request.ts";

// Behavior tests on the engine, a checkpoint's episodes and activations, and recorded episodes as animations.

const project = (id: string) => `/projects/${encodeURIComponent(id)}/behavior-tests`;
const run = (id: string) => `/runs/${encodeURIComponent(id)}`;

export type CheckpointRef = { run: string; step: number };

export const behaviorApi = {
  tests: (projectId: string): Promise<BehaviorTest[]> => request(project(projectId), {}, isBehaviorTests),
  addTest: (projectId: string, draft: BehaviorTestDraft): Promise<BehaviorTest> =>
    request(project(projectId), { method: "POST", body: JSON.stringify(draft) }, isBehaviorTest),
  runTest: (runId: string, step: number, testId: string): Promise<BehaviorTestResult> =>
    request(
      `${run(runId)}/checkpoints/${step}/behavior-tests/${encodeURIComponent(testId)}`,
      { method: "POST" },
      isBehaviorTestResult,
    ),
  results: (runId: string): Promise<BehaviorTestResult[]> =>
    request(`${run(runId)}/behavior-tests`, {}, isBehaviorTestResults),
  compare: (testId: string, a: CheckpointRef, b: CheckpointRef): Promise<BehaviorComparison> => {
    const query = new URLSearchParams({
      test: testId,
      a: a.run,
      a_step: String(a.step),
      b: b.run,
      b_step: String(b.step),
    });
    return request(`/behavior-tests/compare?${query}`, {}, isBehaviorComparison);
  },
  episodes: (runId: string, step: number): Promise<CheckpointEpisode[]> =>
    request(`${run(runId)}/checkpoints/${step}/episodes`, {}, isCheckpointEpisodes),
  activations: (runId: string, step: number): Promise<EpisodeActivations> =>
    request(`${run(runId)}/episode-activations?step=${step}`, {}, isEpisodeActivations),
  recording: (runId: string, step: number, episode = 0): Promise<Blob> =>
    requestFile(`${run(runId)}/checkpoints/${step}/recording?episode=${episode}`, { method: "POST" }, "image/png"),
};

export type BehaviorApi = typeof behaviorApi;
