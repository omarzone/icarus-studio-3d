import type {
  AttachmentInfo,
  CopilotProposal,
  Conversation as EngineConversation,
  ProposalChange as EngineProposalChange,
  SceneGeom,
} from "@icarus/contracts";
import type { AttachmentLinks } from "../engine-client/attachment-api.ts";
import type { ChatAttachment, ChatMessage, Conversation, Proposal, ProposalChange, RichText } from "./copilot-port.ts";

// Pure mappings from the engine's conversation documents onto the chat's view types.

function changeView(change: EngineProposalChange): ProposalChange {
  if (change.before === undefined || change.before === null) {
    return { kind: "add", text: `${change.label} · ${change.after}` };
  }
  return { kind: "diff", label: change.label, from: change.before, to: change.after };
}

function introOf(proposal: CopilotProposal): RichText {
  const summary = /[.!?]$/.test(proposal.summary) ? proposal.summary : `${proposal.summary}.`;
  const explanation = proposal.explanation.trim();
  return explanation === ""
    ? [{ text: summary, strong: true }]
    : [{ text: summary, strong: true }, { text: ` ${explanation}` }];
}

function revisionOf(proposal: CopilotProposal): number | undefined {
  switch (proposal.status) {
    case "open":
      return proposal.base_revision + 1;
    case "applied":
      return proposal.applied_revision ?? undefined;
    case "discarded":
    case "outdated":
      return undefined;
  }
}

export function proposalView(proposal: CopilotProposal): Proposal {
  return {
    id: proposal.id,
    revision: revisionOf(proposal),
    intro: introOf(proposal),
    changes: proposal.changes.map(changeView),
    warnings: proposal.warnings,
    // Finishing a proposal by hand in the editor is not built yet.
    editable: false,
    status: proposal.status,
  };
}

export function attachmentView(info: AttachmentInfo, links: AttachmentLinks | null): ChatAttachment {
  return {
    id: info.id,
    kind: info.kind,
    name: info.name,
    mediaType: info.media_type,
    size: info.size,
    url: links ? links.content(info.id) : null,
    poster: links && info.kind === "video" ? links.frame(info.id, 0) : null,
  };
}

export function hasAttachments(conversation: EngineConversation): boolean {
  return conversation.messages.some((message) => (message.attachments ?? []).length > 0);
}

// Files the person sent, and apart from them the renders of the scene the app took for the copilot.
function userMessage(message: EngineConversation["messages"][number], links: AttachmentLinks | null): ChatMessage {
  const all = (message.attachments ?? []).map((info) => attachmentView(info, links));
  const files = all.filter((item) => item.kind !== "view");
  const views = all.filter((item) => item.kind === "view");
  return {
    id: message.id,
    role: "user",
    text: message.text,
    ...(files.length > 0 ? { attachments: files } : {}),
    ...(views.length > 0 ? { views } : {}),
  };
}

export function conversationView(conversation: EngineConversation, links: AttachmentLinks | null = null): Conversation {
  const proposals = new Map(conversation.proposals.map((proposal) => [proposal.id, proposal]));
  const messages = conversation.messages.flatMap((message): ChatMessage[] => {
    if (message.role === "user") {
      return [userMessage(message, links)];
    }
    const answer: ChatMessage = {
      id: message.id,
      role: "copilot",
      text: [{ text: message.text }],
      markdown: message.text,
      ...(message.thinking ? { thinking: message.thinking } : {}),
    };
    const proposal = message.proposal_id ? proposals.get(message.proposal_id) : undefined;
    return proposal
      ? [answer, { id: `proposal-${proposal.id}`, role: "proposal", proposal: proposalView(proposal) }]
      : [answer];
  });
  return {
    messages,
    suggestions: conversation.suggestions.map((text) => ({ text, intent: "ask" })),
    autonomy: conversation.autonomy,
  };
}

export function openProposal(conversation: EngineConversation): CopilotProposal | undefined {
  return conversation.proposals.find((proposal) => proposal.status === "open");
}

const EPSILON = 1e-6;

function near(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => Math.abs(value - (b[index] ?? Number.NaN)) < EPSILON);
}

function sameGeom(a: SceneGeom, b: SceneGeom): boolean {
  return (
    a.shape === b.shape &&
    a.color.toLowerCase() === b.color.toLowerCase() &&
    near(a.size, b.size) &&
    near(a.position, b.position) &&
    near(a.quaternion, b.quaternion)
  );
}

// Geoms of the proposal scene that are new or differ from the current scene: what the preview draws in blue.
export function changedGeoms(current: readonly SceneGeom[], proposed: readonly SceneGeom[]): SceneGeom[] {
  const before = new Map(current.map((geom) => [geom.name, geom]));
  return proposed.filter((geom) => {
    const previous = before.get(geom.name);
    return !previous || !sameGeom(previous, geom);
  });
}

const WORKSPACES: Readonly<Record<string, string>> = {
  WORLD: "World",
  IDEAS: "World",
  BODY: "Body",
  BRAIN: "Brain",
  TRAIN: "Train",
  RESULTS: "Results",
  BUILD: "Build",
  PLAY: "Play",
  MOTION: "Motion",
};

// The workspace a screen belongs to ("STA-WORLD-PROPOSAL" → "World"), so the copilot knows where the user is.
export function workspaceOf(screen: string): string | undefined {
  const [kind, area] = screen.split("-");
  if (kind !== "SCR" && kind !== "STA") {
    return undefined;
  }
  return area ? WORKSPACES[area] : undefined;
}
