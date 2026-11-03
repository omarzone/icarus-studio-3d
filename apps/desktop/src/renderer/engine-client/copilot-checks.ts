import type {
  AgentStep,
  AttachmentInfo,
  BuildStatus,
  ChatAction,
  ChatSuggestion,
  CheckItem,
  Conversation,
  CopilotMessage,
  CopilotProposal,
  DesignIdea,
  IdeaSet,
  ModelConnection,
  ModelSettings,
  PlanItem,
} from "@icarus/contracts";
import { has, isListOf, isRecord, isSceneDescription } from "./response-checks.ts";

// Structural checks of copilot answers: the fields the app reads, not the whole schema.

const CAPABILITIES: readonly string[] = ["reasoning", "vision", "image", "pose"];
const PROPOSAL_STATES: readonly string[] = ["open", "applied", "discarded", "outdated"];
const STEP_STATES: readonly string[] = ["done", "running", "todo"];
const ATTACHMENT_KINDS: readonly string[] = ["image", "video", "document", "view", "model"];
const ACTION_KINDS: readonly string[] = [
  "navigate",
  "train",
  "apply",
  "discard",
  "send",
  "show",
  "dismiss",
  "apply_and_train",
];
const SUGGESTION_INTENTS: readonly string[] = [
  "ask",
  "propose-change",
  "explain",
  "diagnose",
  "compare",
  "train-run",
  "stop-run",
  "play",
  "show",
  "share",
];
const AGENT_TOOLS: readonly string[] = ["inspect", "look", "try", "propose", "train", "library", "export"];

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isOptional(value: Record<string, unknown>, key: string, kind: "string" | "number"): boolean {
  const field = value[key];
  return field === undefined || field === null || typeof field === kind;
}

export function isAttachmentInfo(value: unknown): value is AttachmentInfo {
  return (
    isRecord(value) &&
    has(value, "id", "string") &&
    typeof value.kind === "string" &&
    ATTACHMENT_KINDS.includes(value.kind) &&
    has(value, "name", "string") &&
    has(value, "media_type", "string") &&
    has(value, "size", "number")
  );
}

function isChatAction(value: unknown): value is ChatAction {
  return (
    isRecord(value) &&
    has(value, "label", "string") &&
    typeof value.kind === "string" &&
    ACTION_KINDS.includes(value.kind) &&
    isOptional(value, "target", "string")
  );
}

export function isAgentStep(value: unknown): value is AgentStep {
  return (
    isRecord(value) &&
    typeof value.tool === "string" &&
    AGENT_TOOLS.includes(value.tool) &&
    has(value, "summary", "string") &&
    (value.ok === undefined || typeof value.ok === "boolean")
  );
}

function isCheckItem(value: unknown): value is CheckItem {
  return isRecord(value) && has(value, "text", "string") && (value.tone === "ok" || value.tone === "warn");
}

function isPlanItem(value: unknown): value is PlanItem {
  return (
    isRecord(value) &&
    (value.mark === "add" || value.mark === "change") &&
    has(value, "label", "string") &&
    has(value, "detail", "string")
  );
}

function isRunCard(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (isRecord(value) && has(value, "run_id", "string") && isOptional(value, "milestone_step", "number"))
  );
}

function isSuggestionItem(value: unknown): value is ChatSuggestion {
  return (
    isRecord(value) &&
    has(value, "text", "string") &&
    (value.intent === undefined || (typeof value.intent === "string" && SUGGESTION_INTENTS.includes(value.intent)))
  );
}

function isMessage(value: unknown): value is CopilotMessage {
  return (
    isRecord(value) &&
    has(value, "id", "string") &&
    (value.role === "user" || value.role === "copilot") &&
    has(value, "text", "string") &&
    isOptional(value, "proposal_id", "string") &&
    isOptional(value, "thinking", "string") &&
    (value.attachments === undefined || isListOf(value.attachments, isAttachmentInfo)) &&
    (value.actions === undefined || isListOf(value.actions, isChatAction)) &&
    (value.steps === undefined || isListOf(value.steps, isAgentStep)) &&
    isOptional(value, "title", "string") &&
    isOptional(value, "build_id", "string") &&
    (value.checks === undefined || isListOf(value.checks, isCheckItem)) &&
    (value.plan === undefined || isListOf(value.plan, isPlanItem)) &&
    isRunCard(value.run)
  );
}

function isChange(value: unknown): boolean {
  return (
    isRecord(value) &&
    has(value, "label", "string") &&
    has(value, "after", "string") &&
    isOptional(value, "before", "string")
  );
}

function isProposal(value: unknown): value is CopilotProposal {
  return (
    isRecord(value) &&
    has(value, "id", "string") &&
    has(value, "base_revision", "number") &&
    has(value, "summary", "string") &&
    has(value, "explanation", "string") &&
    Array.isArray(value.changes) &&
    value.changes.every(isChange) &&
    isListOf(value.warnings, isString) &&
    typeof value.status === "string" &&
    PROPOSAL_STATES.includes(value.status) &&
    isOptional(value, "applied_revision", "number")
  );
}

export function isConversation(value: unknown): value is Conversation {
  return (
    isRecord(value) &&
    has(value, "project_id", "string") &&
    (value.autonomy === "ask" || value.autonomy === "autopilot") &&
    isListOf(value.messages, isMessage) &&
    isListOf(value.proposals, isProposal) &&
    isListOf(value.suggestions, isString) &&
    (value.suggestion_items === undefined || isListOf(value.suggestion_items, isSuggestionItem))
  );
}

function isIdea(value: unknown): value is DesignIdea {
  return (
    isRecord(value) &&
    has(value, "id", "string") &&
    has(value, "title", "string") &&
    has(value, "world", "string") &&
    has(value, "body", "string") &&
    has(value, "learns", "string") &&
    has(value, "estimate_minutes", "number") &&
    has(value, "recommended", "boolean") &&
    isSceneDescription(value.scene)
  );
}

export function isIdeaSet(value: unknown): value is IdeaSet {
  return isRecord(value) && has(value, "id", "string") && isListOf(value.ideas, isIdea);
}

export function isBuildStatus(value: unknown): value is BuildStatus {
  return (
    isRecord(value) &&
    has(value, "build_id", "string") &&
    isOptional(value, "project_id", "string") &&
    has(value, "progress", "number") &&
    has(value, "activity", "string") &&
    has(value, "ready", "boolean") &&
    isOptional(value, "error", "string") &&
    Array.isArray(value.steps) &&
    value.steps.every(
      (step) =>
        isRecord(step) &&
        has(step, "id", "string") &&
        has(step, "label", "string") &&
        typeof step.status === "string" &&
        STEP_STATES.includes(step.status),
    )
  );
}

function isConnection(value: unknown): value is ModelConnection {
  return (
    isRecord(value) &&
    typeof value.capability === "string" &&
    CAPABILITIES.includes(value.capability) &&
    isOptional(value, "model", "string") &&
    has(value, "required", "boolean") &&
    has(value, "connected", "boolean") &&
    isOptional(value, "detail", "string") &&
    isOptional(value, "context_tokens", "number")
  );
}

export function isModelSettings(value: unknown): value is ModelSettings {
  return (
    isRecord(value) &&
    has(value, "endpoint", "string") &&
    has(value, "api_key_hint", "string") &&
    isListOf(value.connections, isConnection)
  );
}
