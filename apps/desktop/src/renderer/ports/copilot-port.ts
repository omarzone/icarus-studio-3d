import type { SceneGeom } from "@icarus/contracts";
import { pending } from "../app/runtime/pending.ts";
import { definePort } from "../app/runtime/port.tsx";
import { createCopilotFixture } from "./copilot.fixture.ts";
import { createEngineCopilot } from "./copilot-engine.ts";

// The copilot conversation of a workspace: messages, proposals waiting for approval and suggestions.
export type RichText = readonly { text: string; strong?: boolean }[];

export type CheckItem = { text: string; tone: "ok" | "warn" };

export type ProposalChange = { kind: "diff"; label: string; from: string; to: string } | { kind: "add"; text: string };

// "outdated" when the project moved on before the proposal was answered.
export type ProposalStatus = "open" | "applied" | "discarded" | "outdated";

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
      // How the copilot thought about it, shown on demand.
      thinking?: string;
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
  | "dismiss"
  | "resize-brain"
  | "play"
  | "show"
  | "template"
  | "export";

export type Suggestion = { text: string; intent: SuggestionIntent };

export type AutonomyMode = "ask" | "autopilot";

export type Conversation = {
  messages: readonly ChatMessage[];
  suggestions: readonly Suggestion[];
  autonomy: AutonomyMode;
  // Limit shown next to the autonomy mode ("5 tries").
  autonomyNote?: string;
};

// The open proposal drawn over the viewport: what it adds or changes, in the engine's compiled scene.
export type ProposalPreview = { id: string; revision?: number; geoms: readonly SceneGeom[] };

export type MessageInput = {
  key: string;
  text: string;
  // The object selected in the editor, so "this" means something.
  selection?: string | null;
  // The workspace the user is in ("World", "Train"…).
  workspace?: string;
};

// The key is the project id in the app and a sample conversation in the prototype.
export type CopilotPort = {
  getConversation: (key: string) => Promise<Conversation>;
  sendMessage: (input: MessageInput) => Promise<Conversation>;
  applyProposal: (input: { key: string; id: string }) => Promise<Conversation>;
  discardProposal: (input: { key: string; id: string }) => Promise<Conversation>;
  setAutonomy: (input: { key: string; mode: AutonomyMode }) => Promise<Conversation>;
  attachFile: (input: { key: string }) => Promise<void>;
  // The proposal waiting for an answer, or null when there is none.
  getPreview: (key: string) => Promise<ProposalPreview | null>;
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
    ...createEngineCopilot(),
    attachFile: pending({
      key: "copilot.attach",
      summary: "Attaching a file to the chat",
      sprint: 6,
      ids: [...chatIds],
    }),
  },
  prototype: createCopilotFixture,
});
