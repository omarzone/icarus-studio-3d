import type { Conversation } from "./copilot-port.ts";

// Sample conversations of Play, Train and Results from the design, for the prototype and tests only.
export const TRAINING_CONVERSATIONS: Readonly<Record<string, Conversation>> = {
  "park-pilot-play": {
    autonomy: "ask",
    suggestions: [
      { text: "Make it night", intent: "propose-change" },
      { text: "Try 10 random lots", intent: "propose-change" },
      { text: "Record this", intent: "record" },
    ],
    messages: [
      { id: "u1", role: "user", text: "What if a car blocks the way?" },
      {
        id: "c1",
        role: "copilot",
        text: [
          {
            text: "It braked in time and is trying a wider turn. It never saw a blocked lane in training, so it hesitates. Want me to add moving cars to the training copies?",
          },
        ],
        actions: [
          { text: "Add to training", intent: "add-to-training" },
          { text: "Not now", intent: "dismiss" },
        ],
      },
    ],
  },
  "fruit-fly-play": {
    autonomy: "ask",
    suggestions: [
      { text: "Cast a shadow", intent: "ask" },
      { text: "Place sugar far away", intent: "ask" },
      { text: "Record this", intent: "record" },
    ],
    messages: [
      { id: "u1", role: "user", text: "What is it doing?" },
      {
        id: "c1",
        role: "copilot",
        text: [
          {
            text: "It smells the sugar you dropped, so the neurons that steer it lit up and it walked over. Nobody taught it this: it is the real fly wiring.",
          },
        ],
        checks: [
          { text: "Walks to food on its own", tone: "ok" },
          { text: "Escapes from shadows", tone: "ok" },
        ],
      },
    ],
  },
  "park-pilot-train": {
    autonomy: "autopilot",
    autonomyNote: "5 tries",
    suggestions: [
      { text: "Why does it scrape?", intent: "diagnose" },
      { text: "Compare with run 2", intent: "compare" },
      { text: "Stop at 500k", intent: "stop-run" },
    ],
    messages: [
      { id: "u1", role: "user", text: "Train it, and tell me how it goes." },
      {
        id: "p1",
        role: "progress",
        progress: {
          title: "Run 3",
          meta: "6 min ago",
          done: 0.31,
          goals: [
            { text: "Learn to drive straight", state: "done" },
            { text: "Reach the parking lot", state: "done" },
            { text: "Park without touching", state: "running" },
            { text: "Park in under 10 s", state: "todo" },
          ],
        },
      },
      { id: "m1", role: "milestone", text: "100k steps" },
      {
        id: "c1",
        role: "copilot",
        text: [{ text: "First time in the spot: " }, { text: "12%", strong: true }, { text: " of test runs." }],
      },
      { id: "m2", role: "milestone", text: "250k steps" },
      {
        id: "c2",
        role: "copilot",
        text: [
          { text: "It parks " },
          { text: "71%", strong: true },
          { text: " of the time, but scrapes a car in " },
          { text: "38%", strong: true },
          { text: " of test runs." },
        ],
      },
      {
        id: "n1",
        role: "plan",
        plan: {
          title: "Next run, if you agree",
          items: [
            { mark: "add", label: "Add 2 side sensors", detail: "to see the car beside it" },
            { mark: "change", label: "Penalty for touching cars", detail: "0.2 → 1.0" },
          ],
          actions: [
            { text: "Try it as run 4", intent: "train-run" },
            { text: "Explain more", intent: "explain" },
          ],
        },
      },
    ],
  },
  "park-pilot-results": {
    autonomy: "ask",
    suggestions: [
      { text: "Show where it fails", intent: "diagnose" },
      { text: "Share run 3", intent: "share" },
      { text: "Train run 4", intent: "train-run" },
    ],
    messages: [
      { id: "u1", role: "user", text: "Is run 3 actually better?" },
      {
        id: "c1",
        role: "copilot",
        text: [
          { text: "Yes. On the same 50 test runs, run 3 parks " },
          { text: "71%", strong: true },
          { text: " of the time against " },
          { text: "44%", strong: true },
          { text: ", and hits other cars less than before." },
        ],
        checks: [
          { text: "Parks 27 points more often", tone: "ok" },
          { text: "1.9 s faster on average", tone: "ok" },
          { text: "Still scrapes on tight left turns", tone: "warn" },
        ],
      },
    ],
  },
  "park-pilot-failures": {
    autonomy: "ask",
    suggestions: [
      { text: "Why only on the left?", intent: "ask" },
      { text: "Train run 4", intent: "train-run" },
    ],
    messages: [
      { id: "u1", role: "user", text: "Show me where it fails." },
      {
        id: "c1",
        role: "copilot",
        text: [
          { text: "I watched all 50 test runs. Most failures are " },
          { text: "tight left turns:", strong: true },
          { text: " the car only notices the parked car on its left when it is already too close." },
        ],
        checks: [
          { text: "Add 2 side sensors so it sees the left car earlier", tone: "ok" },
          { text: "Raise the penalty for touching cars 0.2 → 1.0", tone: "ok" },
        ],
        actions: [
          { text: "Apply as revision 14", intent: "apply-fix" },
          { text: "Show other failures", intent: "ask" },
        ],
      },
    ],
  },
  "fruit-fly-reference": {
    autonomy: "ask",
    suggestions: [
      { text: "Why is grooming late?", intent: "explain" },
      { text: "Record a video", intent: "record" },
    ],
    messages: [
      { id: "u1", role: "user", text: "Does it really behave like a fly?" },
      {
        id: "c1",
        role: "copilot",
        text: [
          {
            text: "In 3 of 4 tests it stays within the range of real flies. Walking and escaping look right. Grooming starts ",
          },
          { text: "0.7 s", strong: true },
          { text: " late, probably because the antenna touch neurons are not wired to the legs yet." },
        ],
        checks: [
          { text: "Same walking speed and gait", tone: "ok" },
          { text: "Escapes shadows almost as fast", tone: "ok" },
          { text: "Grooming: connect antenna neurons to the front legs", tone: "warn" },
        ],
        actions: [
          { text: "Wire the antennas", intent: "apply-fix" },
          { text: "Share it", intent: "share" },
        ],
      },
    ],
  },
};
