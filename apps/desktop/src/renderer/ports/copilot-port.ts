import { pending } from "../app/runtime/pending.ts";
import { definePort } from "../app/runtime/port.tsx";
import { createCopilotFixture } from "./copilot.fixture.ts";

// The copilot conversation of a workspace: messages, proposals waiting for approval and suggestions.
export type RichText = readonly { text: string; strong?: boolean }[];

export type CheckItem = { text: string; tone: "ok" | "warn" };

export type ProposalChange = { kind: "diff"; label: string; from: string; to: string } | { kind: "add"; text: string };

export type ProposalStatus = "open" | "applied" | "discarded";

export type Proposal = {
  id: string;
  // Revision the change becomes once applied.
  revision?: number;
  intro: RichText;
  changes: readonly ProposalChange[];
  // Side effects the user should know before applying.
  warnings: readonly string[];
  // Whether the change can be opened in the editor to finish by hand.
  editable: boolean;
  status: ProposalStatus;
};

export type ChatMessage =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "copilot";
      title?: string;
      text: RichText;
      checks?: readonly CheckItem[];
      // Inline actions under the answer; the first is the primary one.
      actions?: readonly Suggestion[];
    }
  | { id: string; role: "proposal"; proposal: Proposal }
  // Live progress of the project the copilot is building.
  | { id: string; role: "build"; scene: string }
  // A point in a training run the following messages belong to ("100k steps").
  | { id: string; role: "milestone"; text: string }
  // Live progress of a training run with its goals.
  | { id: string; role: "progress"; progress: RunProgress }
  // Changes the copilot suggests for the next step, with the actions that take them.
  | { id: string; role: "plan"; plan: NextStepPlan };

export type GoalState = "done" | "running" | "todo";

export type RunProgress = {
  title: string;
  // When it started ("6 min ago").
  meta: string;
  // Share of the run done, from 0 to 1.
  done: number;
  goals: readonly { text: string; state: GoalState }[];
};

export type NextStepPlan = {
  title: string;
  items: readonly { mark: "add" | "change"; label: string; detail: string }[];
  actions: readonly Suggestion[];
};

// What a suggestion does when sent; each workspace decides where that leads.
export type SuggestionIntent =
  | "propose-change"
  | "new-idea"
  | "refine-ideas"
  | "import"
  | "motion-video"
  | "explain"
  | "export-brain"
  | "order-parts"
  | "record"
  | "diagnose"
  | "compare"
  | "stop-run"
  | "train-run"
  | "share"
  | "apply-fix"
  | "add-to-training"
  | "ask"
  | "dismiss";

export type Suggestion = { text: string; intent: SuggestionIntent };

export type AutonomyMode = "ask" | "autopilot";

export type Conversation = {
  messages: readonly ChatMessage[];
  suggestions: readonly Suggestion[];
  autonomy: AutonomyMode;
  // Limit shown next to the autonomy mode ("5 tries").
  autonomyNote?: string;
};

export type CopilotPort = {
  getConversation: (key: string) => Promise<Conversation>;
  sendMessage: (input: { key: string; text: string }) => Promise<Conversation>;
  applyProposal: (input: { key: string; id: string }) => Promise<Conversation>;
  discardProposal: (input: { key: string; id: string }) => Promise<Conversation>;
  setAutonomy: (input: { key: string; mode: AutonomyMode }) => Promise<Conversation>;
  attachFile: (input: { key: string }) => Promise<void>;
};

const chatIds = [
  "SCR-WORLD",
  "STA-WORLD-EMPTY",
  "STA-WORLD-EMPTY-NOGUIDE",
  "STA-WORLD-BUILDING",
  "STA-WORLD-PROPOSAL",
  "SCR-IDEAS",
  "SCR-PLAY",
  "SCR-PLAY.b",
  "SCR-TRAIN",
  "SCR-RESULTS",
  "STA-RESULTS-FAILURES",
  "STA-RESULTS-REFERENCE",
] as const;

export const copilotPort = definePort<CopilotPort>({
  app: {
    getConversation: pending({
      key: "copilot.conversation",
      summary: "The copilot conversation",
      sprint: 6,
      ids: [...chatIds],
    }),
    sendMessage: pending({ key: "copilot.send", summary: "Talking to the copilot", sprint: 6, ids: [...chatIds] }),
    applyProposal: pending({
      key: "copilot.apply",
      summary: "Applying a change the copilot proposed",
      sprint: 6,
      ids: ["STA-WORLD-PROPOSAL", "POP-ADD-COMPONENT"],
    }),
    discardProposal: pending({
      key: "copilot.discard",
      summary: "Discarding a change the copilot proposed",
      sprint: 6,
      ids: ["STA-WORLD-PROPOSAL", "POP-ADD-COMPONENT"],
    }),
    setAutonomy: pending({
      key: "copilot.autonomy",
      summary: "Choosing when the copilot asks before changing things",
      sprint: 6,
      ids: [...chatIds],
    }),
    attachFile: pending({
      key: "copilot.attach",
      summary: "Attaching a file to the chat",
      sprint: 6,
      ids: [...chatIds],
    }),
  },
  prototype: createCopilotFixture,
});
