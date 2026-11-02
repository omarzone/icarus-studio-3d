import type { AutopilotStatus, CopilotProposal, Diagnosis, FailureGroup } from "@icarus/contracts";

// Builders of coach documents as the engine sends them, for the results and autopilot port tests.

export const group = (overrides: Partial<FailureGroup> = {}): FailureGroup => ({
  label: "Falls forward early",
  share: 0.46,
  description: "It leans forward and falls in the first second.",
  frame_attachment_ids: ["frame-a", "frame-b"],
  ...overrides,
});

export const diagnosis = (overrides: Partial<Diagnosis> = {}): Diagnosis => ({
  id: "d-1",
  project_id: "p",
  run_id: "run-3",
  step: 250_000,
  created_at: "2026-11-01T10:30:00Z",
  summary: "It falls before it learns to step.",
  observations: ["Success stays at 0% over the last 3 checkpoints"],
  evidence: [],
  failure_groups: [group()],
  hypothesis: "The upright reward is too small next to the speed reward.",
  next_step: "stop_and_fix",
  proposal_id: "prop-1",
  ...overrides,
});

export const proposal = (overrides: Partial<CopilotProposal> = {}): CopilotProposal => ({
  id: "prop-1",
  project_id: "p",
  base_revision: 3,
  summary: "Raise the upright reward",
  explanation: "",
  operations: [{ op: "rename_object", object: "a", name: "b" }],
  changes: [],
  warnings: [],
  status: "open",
  ...overrides,
});

export const autopilot = (overrides: Partial<AutopilotStatus> = {}): AutopilotStatus => ({
  project_id: "p",
  mode: "fix",
  state: "running",
  iteration: 2,
  max_iterations: 4,
  goal_success: 0.8,
  started_at: "2026-11-01T10:00:00Z",
  run_ids: ["run-2", "run-3"],
  diagnosis_ids: ["d-1"],
  best_run_id: "run-2",
  best_success: 0.64,
  log: [],
  ...overrides,
});
