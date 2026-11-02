import type { AnswerAction, ChatMessage, ProposalStatus } from "../../ports/copilot-port.ts";

// What the options under one answer show: still pressable, the one the person picked, or nothing.
export type OptionsState = { show: "live" } | { show: "chosen"; label: string } | { show: "none" };

// One pressable option: its button label and the text it sends, if it sends any.
type Option = { label: string; sends: string | null; kind: AnswerAction["kind"] | "suggestion" };

const normalized = (text: string) => text.trim().toLowerCase();

function optionsOf(message: ChatMessage): Option[] {
  if (message.role === "plan") {
    return message.plan.actions.map((action) => ({ label: action.text, sends: action.text, kind: "suggestion" }));
  }
  if (message.role !== "copilot") {
    return [];
  }
  if (message.actions) {
    return message.actions.map((action) => ({ label: action.text, sends: action.text, kind: "suggestion" }));
  }
  return (message.answerActions ?? []).map((action) => ({
    label: action.label,
    sends: action.kind === "send" ? action.target?.trim() || action.label : null,
    kind: action.kind,
  }));
}

function proposalStatus(messages: readonly ChatMessage[], id: string): ProposalStatus | null {
  for (const message of messages) {
    if (message.role === "proposal" && message.proposal.id === id) {
      return message.proposal.status;
    }
  }
  return null;
}

function chosen(options: readonly Option[], kind: Option["kind"] | null, reply: string | null): OptionsState {
  const key = reply === null ? null : normalized(reply);
  const pick = options.find((option) =>
    kind ? option.kind === kind : option.sends !== null && normalized(option.sends) === key,
  );
  return pick ? { show: "chosen", label: pick.label } : { show: "none" };
}

// Only the newest answer nobody replied to keeps live options; older ones collapse to what the person picked
// (the reply that matched an option, or Apply/Discard once the proposal was answered) or disappear.
// `pending` is the message on its way, which counts as the reply.
export function answerOptions(messages: readonly ChatMessage[], pending: string | null): Map<string, OptionsState> {
  const states = new Map<string, OptionsState>();
  let reply = pending;
  let newest = true;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }
    if (message.role === "user") {
      reply = message.text;
      newest = false;
      continue;
    }
    const options = optionsOf(message);
    if (options.length === 0) {
      continue;
    }
    const proposal = message.role === "copilot" ? message.proposal : undefined;
    if (proposal && !proposal.open) {
      const status = proposalStatus(messages, proposal.id);
      const kind = status === "applied" ? "apply" : status === "discarded" ? "discard" : null;
      states.set(message.id, kind ? chosen(options, kind, null) : { show: "none" });
    } else if (newest && reply === null) {
      states.set(message.id, { show: "live" });
    } else {
      states.set(message.id, chosen(options, null, reply));
    }
    newest = false;
    reply = null;
  }
  return states;
}
