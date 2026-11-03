import { pending } from "../app/runtime/pending.ts";
import { definePort } from "../app/runtime/port.tsx";
import type { AgentComparison } from "./agent-comparison.ts";
import { createResultsFixture } from "./results.fixture.ts";
import { createEngineResultsPort } from "./results-engine.ts";

// Results of training: fair comparisons, how it learned, where it fails, the timelapse and reference tests.

export type Tone = "ok" | "warn" | "danger" | "neutral";

export type ResultRun = {
  id: string;
  name: string;
  detail: string;
  score: string;
  compared: boolean;
  // The run the rest of the workspace is about (highlighted).
  current: boolean;
};

export type BestBrain = { id: string; run: string; checkpoint: string; score: string };

export type ScoreBar = { label: string; value: string; ratio: number; tone: Tone };

export type ResultSummary =
  | { kind: "best"; title: string; detail: string }
  | { kind: "scores"; title: string; scores: readonly ScoreBar[]; note: string }
  // Reference brains: how many behaviors match recordings, and the next test to run.
  | { kind: "match"; title: string; value: string; detail: string; nextTest: string }
  // Nothing to judge yet (no checkpoint evaluated).
  | { kind: "empty"; title: string; detail: string };

export type SummaryView = "best" | "failures" | "reference";

export type Comparison = {
  // Why the comparison is fair ("Same seed").
  basis: string;
  sides: readonly { id: string; title: string; chips: readonly { text: string; tone: Tone }[] }[];
  // The numbers of both runs read from their checkpoints, when the engine compares real runs.
  table?: CompareTable;
  // The newest group of agents trained together, agent by agent, when the project has several agents.
  agents?: AgentComparison;
};

export type CompareTable = {
  columns: readonly [string, string];
  rows: readonly { label: string; values: readonly [string, string] }[];
};

export type Checkpoint =
  | { id: string; reached: true; step: string; label: string; detail?: string; current: boolean }
  | { id: string; reached: false; step: string; eta: string };

export type LearningHistory = { training: boolean; checkpoints: readonly Checkpoint[] };

// `frame` is the address of a picture of the group's first episode, when the engine rendered one.
export type FailureGroup = { id: string; title: string; count: string; frame?: string };

export type Failures = { total: string; selected: string; groups: readonly FailureGroup[] };

export type TestRun = { id: string; label: string; passed: boolean };

// A failing test run as the copilot explains it, with the replay position.
export type FailureReplay = {
  watched: string;
  note: { title: string; detail: string };
  at: string;
  played: number;
  run: string;
  // Pictures of the group's episodes rendered by the engine; drawn instead of a replay when present.
  frames?: readonly { id: string; url: string }[];
  // No failure group to show yet.
  empty?: boolean;
};

export type Timelapse = {
  eyebrow: string;
  title: string;
  frames: readonly { id: string; label: string }[];
  current: string;
  at: string;
  length: string;
  played: number;
};

export type ReferenceTestState = "pass" | "warn" | "not-run";

export type ReferenceTest = { id: string; name: string; short: string; state: ReferenceTestState };

export type ReferenceTests = { selected: string; tests: readonly ReferenceTest[] };

export type Recording = { id: string; name: string; detail: string };

// Points of a walking path inside a round arena, in arena units from 0 to 100.
export type Path = readonly (readonly [number, number])[];

export type ReferenceComparison = {
  basis: string;
  sides: readonly { id: string; title: string; detail: string; paths: readonly Path[] }[];
};

export type BehaviorMatch = { behavior: string; recorded: string; simulated: string; verdict: "close" | "off" };

export type NeuronLink = { behavior: string; neurons: string };

export type ProposalStatus = "open" | "applied" | "discarded" | "outdated";

// What the coach found at one checkpoint and what it recommends, with its fix as a copilot proposal.
export type DiagnosisView = {
  id: string;
  title: string;
  // ISO time it was made.
  createdAt: string;
  summary: string;
  hypothesis: string;
  observations: readonly string[];
  nextStep: { label: string; tone: Tone };
  proposal: { id: string; summary: string; status: ProposalStatus } | null;
};

export type ResultsPort = {
  listRuns: (project: string) => Promise<ResultRun[]>;
  toggleCompare: (input: { project: string; id: string }) => Promise<ResultRun[]>;
  listBestBrains: (project: string) => Promise<BestBrain[]>;
  getSummary: (input: { project: string; view: SummaryView }) => Promise<ResultSummary>;
  getNotes: (project: string) => Promise<string>;
  saveNotes: (input: { project: string; text: string }) => Promise<string>;
  getComparison: (project: string) => Promise<Comparison>;
  getLearningHistory: (project: string) => Promise<LearningHistory>;
  getFailures: (project: string) => Promise<Failures>;
  selectFailure: (input: { project: string; id: string }) => Promise<Failures>;
  listTestRuns: (project: string) => Promise<TestRun[]>;
  getFailureReplay: (project: string) => Promise<FailureReplay>;
  getTimelapse: (project: string) => Promise<Timelapse>;
  selectTimelapseFrame: (input: { project: string; id: string }) => Promise<Timelapse>;
  getReferenceTests: (project: string) => Promise<ReferenceTests>;
  selectReferenceTest: (input: { project: string; id: string }) => Promise<ReferenceTests>;
  listRecordings: (project: string) => Promise<Recording[]>;
  getReferenceComparison: (input: { project: string; test: string }) => Promise<ReferenceComparison>;
  getBehaviorMatch: (project: string) => Promise<BehaviorMatch[]>;
  getNeuronLinks: (project: string) => Promise<NeuronLink[]>;
  listDiagnoses: (project: string) => Promise<DiagnosisView[]>;
  // Asks the coach about a run (the newest when none is given); it also posts in the project conversation.
  diagnose: (input: { project: string; run?: string }) => Promise<DiagnosisView>;
};

const referenceIds = ["STA-RESULTS-REFERENCE"] as const;

export const resultsPort = definePort<ResultsPort>({
  app: {
    ...createEngineResultsPort(),
    listTestRuns: pending({
      key: "results.testRuns",
      summary: "Every test run with pass or fail",
      sprint: 7,
      ids: ["STA-RESULTS-FAILURES"],
    }),
    getTimelapse: pending({
      key: "results.timelapse",
      summary: "The timelapse of how it learned",
      sprint: 7,
      ids: ["SCR-TIMELAPSE"],
    }),
    selectTimelapseFrame: pending({
      key: "results.timelapseFrame",
      summary: "Jumping to a checkpoint in the timelapse",
      sprint: 7,
      ids: ["SCR-TIMELAPSE"],
    }),
    getReferenceTests: pending({
      key: "results.referenceTests",
      summary: "Tests against recorded real behavior",
      sprint: 11,
      ids: [...referenceIds],
    }),
    selectReferenceTest: pending({
      key: "results.selectReferenceTest",
      summary: "Opening a behavior test",
      sprint: 11,
      ids: [...referenceIds],
    }),
    listRecordings: pending({
      key: "results.recordings",
      summary: "Recordings imported for comparison",
      sprint: 11,
      ids: [...referenceIds],
    }),
    getReferenceComparison: pending({
      key: "results.referenceComparison",
      summary: "Recorded and simulated behavior side by side",
      sprint: 11,
      ids: [...referenceIds],
    }),
    getBehaviorMatch: pending({
      key: "results.behaviorMatch",
      summary: "How close each behavior is to the recordings",
      sprint: 11,
      ids: [...referenceIds],
    }),
    getNeuronLinks: pending({
      key: "results.neurons",
      summary: "Which neurons drive each behavior",
      sprint: 11,
      ids: [...referenceIds],
    }),
  },
  prototype: createResultsFixture,
});
