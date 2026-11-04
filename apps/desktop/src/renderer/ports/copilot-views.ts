import type {
  AttachmentInfo,
  CopilotProposal,
  Conversation as EngineConversation,
  ProposalChange as EngineProposalChange,
  SceneGeom,
} from "@icarus/contracts";
import type { AttachmentLinks } from "../engine-client/attachment-api.ts";
import type {
  AgentStep,
  AnswerAction,
  ChatAttachment,
  ChatMessage,
  CoachFinding,
  Conversation,
  FilmStripView,
  Proposal,
  ProposalChange,
  RichText,
  RunProgress,
} from "./copilot-port.ts";
import { stageGoals } from "./curriculum-views.ts";
import type { RunSummary } from "./training-port.ts";

// Pure mappings from the engine's conversation documents onto the chat's view types.

type EngineMessage = EngineConversation["messages"][number];

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
function userMessage(message: EngineMessage, links: AttachmentLinks | null): ChatMessage {
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

// The coach's strip with each frame's picture served by the engine.
export function filmStripView(strip: EngineMessage["film_strip"], links: AttachmentLinks | null): FilmStripView | null {
  if (!strip || strip.frames.length === 0) {
    return null;
  }
  return {
    step: strip.step,
    episode: strip.episode,
    interval: strip.interval,
    frames: strip.frames.map((frame) => ({
      picture: {
        id: frame.attachment_id,
        kind: "view",
        name: `Step ${strip.step.toLocaleString("en-US")} · ${frame.time.toFixed(1)} s`,
        mediaType: "image/png",
        size: 0,
        url: links ? links.content(frame.attachment_id) : null,
        poster: null,
      },
      time: frame.time,
      failure: frame.failure ?? false,
    })),
  };
}

export function findingViews(message: EngineMessage, proposals: ReadonlyMap<string, CopilotProposal>): CoachFinding[] {
  return (message.findings ?? []).map((finding) => {
    const proposal = finding.proposal_id ? proposals.get(finding.proposal_id) : undefined;
    return {
      area: finding.area,
      behavior: finding.behavior,
      change: finding.change,
      proposal: proposal ? { id: proposal.id, status: proposal.status } : null,
    };
  });
}

// An answer with the buttons the copilot offered, the steps it took and the renders it looked at.
function copilotMessage(
  message: EngineMessage,
  proposals: ReadonlyMap<string, CopilotProposal>,
  links: AttachmentLinks | null,
): ChatMessage {
  const proposal = message.proposal_id ? proposals.get(message.proposal_id) : undefined;
  const strip = filmStripView(message.film_strip, links);
  const findings = findingViews(message, proposals);
  const actions = (message.actions ?? []).map(
    (action): AnswerAction => ({ label: action.label, kind: action.kind, target: action.target ?? null }),
  );
  const steps = (message.steps ?? []).map(
    (step): AgentStep => ({ tool: step.tool, summary: step.summary, ok: step.ok ?? true }),
  );
  const views = (message.attachments ?? [])
    .filter((info) => info.kind === "view")
    .map((info) => attachmentView(info, links));
  return {
    id: message.id,
    role: "copilot",
    text: [{ text: message.text }],
    markdown: message.text,
    ...(message.title ? { title: message.title } : {}),
    ...(message.thinking ? { thinking: message.thinking } : {}),
    ...((message.checks ?? []).length > 0 ? { checks: message.checks } : {}),
    ...(actions.length > 0 ? { answerActions: actions } : {}),
    ...(steps.length > 0 ? { steps } : {}),
    ...(views.length > 0 ? { views } : {}),
    ...(proposal && actions.length > 0 ? { proposal: { id: proposal.id, open: proposal.status === "open" } } : {}),
    ...(strip ? { filmStrip: strip } : {}),
    ...(findings.length > 0 ? { findings } : {}),
  };
}

// "100k steps", "1.5M steps": where in a run the following messages belong.
export function milestoneText(step: number): string {
  if (step >= 1_000_000) {
    return `${Number((step / 1_000_000).toFixed(1))}M steps`;
  }
  if (step >= 1000) {
    return `${Number((step / 1000).toFixed(1))}k steps`;
  }
  return `${step} steps`;
}

// The cards an answer brings after its text: the build it started, the run it is about and the plan it suggests.
function cardsOf(message: EngineMessage): ChatMessage[] {
  const cards: ChatMessage[] = [];
  if (message.build_id) {
    cards.push({ id: `build-${message.id}`, role: "build", scene: message.build_id });
  }
  if (message.run) {
    cards.push({ id: `run-${message.id}`, role: "run", runId: message.run.run_id });
  }
  const plan = message.plan ?? [];
  if (plan.length > 0) {
    cards.push({
      id: `plan-${message.id}`,
      role: "plan",
      plan: {
        title: "Next run, if you agree",
        items: plan.map((item) => ({ mark: item.mark, label: item.label, detail: item.detail })),
        actions: [],
      },
    });
  }
  return cards;
}

export function conversationView(conversation: EngineConversation, links: AttachmentLinks | null = null): Conversation {
  const proposals = new Map(conversation.proposals.map((proposal) => [proposal.id, proposal]));
  let milestone: number | null = null;
  const messages = conversation.messages.flatMap((message): ChatMessage[] => {
    if (message.role === "user") {
      return [userMessage(message, links)];
    }
    const step = message.run?.milestone_step;
    const divider: ChatMessage[] =
      typeof step === "number" && step !== milestone
        ? [{ id: `milestone-${message.id}`, role: "milestone", text: milestoneText(step) }]
        : [];
    if (typeof step === "number") {
      milestone = step;
    }
    const proposal = message.proposal_id ? proposals.get(message.proposal_id) : undefined;
    const answer = copilotMessage(message, proposals, links);
    const card: ChatMessage[] = proposal
      ? [{ id: `proposal-${proposal.id}`, role: "proposal", proposal: proposalView(proposal) }]
      : [];
    return [...divider, answer, ...cardsOf(message), ...card];
  });
  const items = conversation.suggestion_items ?? [];
  return {
    messages,
    suggestions:
      items.length > 0
        ? items.map((item) => ({ text: item.text, intent: item.intent ?? "ask" }))
        : conversation.suggestions.map((text) => ({ text, intent: "ask" })),
    autonomy: conversation.autonomy,
  };
}

// The run card of an answer from the run as the engine reports it now; its goals are the task's curriculum stages.
export function runCardProgress(run: RunSummary): RunProgress {
  const running = run.status === "running";
  return {
    title: run.name,
    meta: running ? "training" : run.detail,
    done: run.status === "done" ? 1 : (run.progress ?? 0),
    goals: stageGoals(run.stages ?? [], run.stage, running || run.status === "paused"),
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
