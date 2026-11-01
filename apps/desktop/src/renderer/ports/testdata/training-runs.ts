import type { CheckpointInfo, MetricPoint, RunStatus } from "@icarus/contracts";

// Builders of training documents as the engine sends them, for the training port tests.

export const status = (overrides: Partial<RunStatus> = {}): RunStatus => ({
  run_id: "run-3",
  project_id: "p",
  revision_number: 3,
  name: "Run 3",
  state: "running",
  step: 312_000,
  total_steps: 1_000_000,
  copies: 16,
  steps_per_second: 1840.4,
  started_at: "2026-11-01T10:00:00Z",
  ...overrides,
});

export const checkpoint = (step: number, success: number | null, ret = 10): CheckpointInfo => ({
  step,
  episode_return: ret,
  success_rate: success,
  failure_rate: success === null ? null : 0.38,
  has_rollout: true,
});

export const trainPoint = (step: number, overrides: Partial<MetricPoint> = {}): MetricPoint => ({
  kind: "train",
  step,
  elapsed: step / 2000,
  episode_return: step / 1000,
  episode_length: 200,
  reward_terms: {},
  ...overrides,
});
