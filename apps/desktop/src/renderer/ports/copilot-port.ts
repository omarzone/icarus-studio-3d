import type { SceneGeom } from "@icarus/contracts";
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

export type AttachmentKind = "image" | "video" | "document" | "view";

// A file sent with a message, or a render of the scene the app took for the copilot ("view").
export type ChatAttachment = {
  id: string;
  kind: AttachmentKind;
  name: string;
  mediaType: string;
  size: number;
  // Where the file is served; null when there is nothing to show.
  url: string | null;
  // A still frame of a video to show before it plays.
  poster: string | null;
};

export type AttachmentInput = {
  key: string;
  kind: AttachmentKind;
  name: string;
  mediaType: string;
  // The file, base64.
  data: string;
  // Still frames of a video, base64 JPEG, so the copilot can watch it.
  frames?: readonly string[];
  // The text of a document, read by the app.
  text?: string;
};

export type AnswerActionKind =
  | "navigate"
  | "train"
  | "apply"
  | "discard"
  | "send"
  | "show"
  | "dismiss"
  | "apply_and_train";

// A button the copilot put under its answer; `target` is a screen id (navigate), an object id (show) or the message
// to send.
export type AnswerAction = { label: string; kind: AnswerActionKind; target: string | null };

export type AgentTool = "inspect" | "look" | "try" | "propose" | "train" | "library";

// One thing the copilot did before answering ("Looked at the lot from above").
export type AgentStep = { tool: AgentTool; summary: string; ok: boolean };

export type ChatMessage =
  | {
      id: string;
      role: "user";
      text: string;
      attachments?: readonly ChatAttachment[];
      // Renders of the scene the copilot looked at to answer this message.
      views?: readonly ChatAttachment[];
    }
  | {
      id: string;
      role: "copilot";
      title?: string;
      text: RichText;
      // The answer as the copilot wrote it, in markdown; sample answers have only rich text.
      markdown?: string;
      // How the copilot thought about it, shown on demand.
      thinking?: string;
      checks?: readonly CheckItem[];
      // Inline actions under the answer; the first is the primary one.
      actions?: readonly Suggestion[];
      // Buttons the copilot offered with the answer; the first is the primary one.
      answerActions?: readonly AnswerAction[];
      // What the copilot did to answer, in order.
      steps?: readonly AgentStep[];
      // Renders the copilot took with its own camera.
      views?: readonly ChatAttachment[];
      // The proposal this answer made, so Apply and Discard act on it.
      proposal?: { id: string; open: boolean };
    }
  | { id: string; role: "proposal"; proposal: Proposal }
  // Live progress of the project the copilot is building.
  | { id: string; role: "build"; scene: string }
  // A point in a training run the following messages belong to ("100k steps").
  | { id: string; role: "milestone"; text: string }
  // Live progress of a training run with its goals.
  | { id: string; role: "progress"; progress: RunProgress }
  // A training run of the project the answer is about, read live from the engine.
  | { id: string; role: "run"; runId: string }
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
  // Ids of uploaded files and scene renders that go with the message.
  attachments?: readonly string[];
  views?: readonly string[];
};

// The key is the project id in the app and a sample conversation in the prototype.
export type CopilotPort = {
  getConversation: (key: string) => Promise<Conversation>;
  sendMessage: (input: MessageInput) => Promise<Conversation>;
  applyProposal: (input: { key: string; id: string }) => Promise<Conversation>;
  discardProposal: (input: { key: string; id: string }) => Promise<Conversation>;
  setAutonomy: (input: { key: string; mode: AutonomyMode }) => Promise<Conversation>;
  attachFile: (input: AttachmentInput) => Promise<ChatAttachment>;
  // The text of a sent document, for its preview.
  readAttachmentText: (id: string) => Promise<string>;
  // The proposal waiting for an answer, or null when there is none.
  getPreview: (key: string) => Promise<ProposalPreview | null>;
};

export const copilotPort = definePort<CopilotPort>({
  app: createEngineCopilot(),
  prototype: createCopilotFixture,
});
