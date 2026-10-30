import { ARENA_WALKS } from "./arena-walks.fixture.ts";
import type {
  BehaviorMatch,
  Comparison,
  FailureReplay,
  Failures,
  LearningHistory,
  NeuronLink,
  Recording,
  ReferenceTests,
  ResultRun,
  ResultSummary,
  ResultsPort,
  SummaryView,
  TestRun,
  Timelapse,
} from "./results-port.ts";

// Sample results from the design (Park Pilot runs and the Fruit Fly reference tests), for the prototype and tests only.
const RUNS: readonly ResultRun[] = [
  {
    id: "run-3",
    name: "Run 3",
    detail: "16 lots · 312k steps · training",
    score: "71%",
    compared: true,
    current: true,
  },
  { id: "run-2", name: "Run 2", detail: "8 lots · 1M steps", score: "44%", compared: true, current: false },
  { id: "run-1", name: "Run 1", detail: "1 lot · 400k steps", score: "9%", compared: false, current: false },
];

const SUMMARIES: Readonly<Record<SummaryView, ResultSummary>> = {
  best: {
    kind: "best",
    title: "Best brain so far",
    detail: "Run 3 · checkpoint 312k · parks 71% · average 8.4 s",
  },
  failures: {
    kind: "scores",
    title: "Run 3 · checkpoint 312k",
    scores: [
      { label: "Parks", value: "71%", ratio: 0.71, tone: "ok" },
      { label: "Scrapes a car", value: "38%", ratio: 0.38, tone: "danger" },
      { label: "Times out", value: "8%", ratio: 0.08, tone: "warn" },
    ],
    note: "Same 50 seeds as run 2, so the numbers compare fairly.",
  },
  reference: {
    kind: "match",
    title: "Overall match",
    value: "3 of 4",
    detail: "Behaviors within the range of real flies. The fourth test has not run yet.",
    nextTest: "flying test",
  },
};

const COMPARISON: Comparison = {
  basis: "Same seed",
  sides: [
    {
      id: "run-2",
      title: "Run 2 · best checkpoint",
      chips: [
        { text: "parks 44%", tone: "neutral" },
        { text: "hits 61%", tone: "danger" },
      ],
    },
    {
      id: "run-3",
      title: "Run 3 · checkpoint 312k",
      chips: [
        { text: "parks 71%", tone: "ok" },
        { text: "scrapes 38%", tone: "warn" },
      ],
    },
  ],
};

const HISTORY: LearningHistory = {
  training: true,
  checkpoints: [
    { id: "0", reached: true, step: "Start", label: "circles", current: false },
    { id: "25k", reached: true, step: "25k", label: "hits a car", current: false },
    { id: "50k", reached: true, step: "50k", label: "reaches lot", current: false },
    { id: "100k", reached: true, step: "100k", label: "12%", current: false },
    { id: "250k", reached: true, step: "250k", label: "71%", current: true },
    { id: "500k", reached: false, step: "500k", eta: "in about 2 min" },
    { id: "1m", reached: false, step: "1M", eta: "in about 6 min" },
  ],
};

const FAILURES: Failures = {
  total: "50 runs",
  selected: "tight-left",
  groups: [
    { id: "tight-left", title: "Tight left turns", count: "23 of 50 test runs" },
    { id: "overshoots", title: "Overshoots the spot", count: "9 of 50" },
    { id: "stops-early", title: "Stops too early", count: "4 of 50" },
  ],
};

const TEST_RUNS: readonly TestRun[] = Array.from({ length: 50 }, (_, index) => ({
  id: `test-${index + 1}`,
  label: `Test run ${index + 1}`,
  passed: index % 3 !== 1 && index % 7 !== 3,
}));

const REPLAY: FailureReplay = {
  watched: "The copilot watched 50 test runs",
  note: {
    title: "Scrapes the left car · 0:01.4",
    detail: "The front-left sensor sees the car only 0.3 s before contact. It turns in too early.",
  },
  at: "0:01.4",
  played: 0.64,
  run: "Test run 17 of 23",
};

const TIMELAPSE: Timelapse = {
  eyebrow: "Park Pilot · how it learned",
  title: "Checkpoint 250k · parks 71%",
  frames: [
    { id: "0", label: "Start · circles" },
    { id: "25k", label: "25k · hits a car" },
    { id: "50k", label: "50k · reaches lot" },
    { id: "100k", label: "100k · 12%" },
    { id: "250k", label: "250k · 71%" },
  ],
  current: "250k",
  at: "0:48",
  length: "1:00",
  played: 0.8,
};

const REFERENCE_TESTS: ReferenceTests = {
  selected: "arena",
  tests: [
    { id: "arena", name: "Open arena walk", short: "Open arena walk", state: "pass" },
    { id: "looming", name: "Looming shadow escape", short: "Looming shadow", state: "pass" },
    { id: "grooming", name: "Grooming after dust", short: "Grooming", state: "warn" },
    { id: "flying", name: "Flying toward light", short: "Flying", state: "not-run" },
  ],
};

const RECORDINGS: readonly Recording[] = [
  { id: "lab-walks", name: "Open arena walks", detail: "5 walks · lab recordings" },
  { id: "lab-looming", name: "Looming shadow", detail: "12 trials · lab recordings" },
];

const MATCH: readonly BehaviorMatch[] = [
  { behavior: "Walking speed", recorded: "17 mm/s", simulated: "18 mm/s", verdict: "close" },
  { behavior: "Tripod gait", recorded: "98%", simulated: "96%", verdict: "close" },
  { behavior: "Turn after a looming shadow", recorded: "55 ms", simulated: "62 ms", verdict: "close" },
  { behavior: "Grooming starts after dust", recorded: "1.2 s", simulated: "1.9 s", verdict: "off" },
];

const NEURONS: readonly NeuronLink[] = [
  { behavior: "Walking speed", neurons: "DNg11, DNg100 · ventral nerve cord" },
  { behavior: "Turn after a looming shadow", neurons: "LPLC2, giant fiber" },
  { behavior: "Grooming starts after dust", neurons: "Antennal touch neurons · not wired to the front legs" },
];

// In-memory results that behave: comparing toggles, selecting selects, notes save.
export function createResultsFixture(): ResultsPort {
  let runs = RUNS;
  let notes = "";
  let failures = FAILURES;
  let timelapse = TIMELAPSE;
  let tests = REFERENCE_TESTS;
  return {
    listRuns: async () => [...runs],
    toggleCompare: async ({ id }) => {
      runs = runs.map((run) => (run.id === id ? { ...run, compared: !run.compared } : run));
      return [...runs];
    },
    listBestBrains: async () =>
      RUNS.map((run) => ({
        id: run.id,
        run: run.name,
        checkpoint: run.id === "run-3" ? "312k" : "1M",
        score: run.score,
      })),
    getSummary: async ({ view }) => SUMMARIES[view],
    getNotes: async () => notes,
    saveNotes: async ({ text }) => {
      notes = text;
      return notes;
    },
    getComparison: async () => COMPARISON,
    getLearningHistory: async () => HISTORY,
    getFailures: async () => failures,
    selectFailure: async ({ id }) => {
      failures = { ...failures, selected: id };
      return failures;
    },
    listTestRuns: async () => [...TEST_RUNS],
    getFailureReplay: async () => REPLAY,
    getTimelapse: async () => timelapse,
    selectTimelapseFrame: async ({ id }) => {
      timelapse = { ...timelapse, current: id };
      return timelapse;
    },
    getReferenceTests: async () => tests,
    selectReferenceTest: async ({ id }) => {
      tests = { ...tests, selected: id };
      return tests;
    },
    listRecordings: async () => [...RECORDINGS],
    getReferenceComparison: async () => ({
      basis: "Same arena",
      sides: [
        { id: "recorded", title: "Real flies", detail: "Lab recordings · 5 walks", paths: ARENA_WALKS.recorded },
        { id: "simulated", title: "Your fly", detail: "Connectome brain · 5 walks", paths: ARENA_WALKS.simulated },
      ],
    }),
    getBehaviorMatch: async () => [...MATCH],
    getNeuronLinks: async () => [...NEURONS],
  };
}
