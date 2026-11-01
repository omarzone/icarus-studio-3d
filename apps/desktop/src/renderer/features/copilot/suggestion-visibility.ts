import type { Conversation, Suggestion } from "../../ports/copilot-port.ts";

const MAX_SUGGESTIONS = 4;

const normalized = (text: string) => text.trim().toLowerCase();

// Suggestions belong to the latest copilot answer: gone while a message is on its way or once the user spoke last,
// and never a repeat of each other, of the answer's own actions or of something the user already asked.
export function visibleSuggestions(
  { messages, suggestions }: Pick<Conversation, "messages" | "suggestions">,
  sending: boolean,
): Suggestion[] {
  const last = messages.at(-1);
  if (sending || last?.role === "user") {
    return [];
  }
  const taken = new Set<string>();
  for (const message of messages) {
    if (message.role === "user") {
      taken.add(normalized(message.text));
    }
  }
  if (last?.role === "copilot") {
    for (const action of last.actions ?? []) {
      taken.add(normalized(action.text));
    }
  }
  const visible: Suggestion[] = [];
  for (const suggestion of suggestions) {
    const key = normalized(suggestion.text);
    if (key === "" || taken.has(key)) {
      continue;
    }
    taken.add(key);
    visible.push(suggestion);
  }
  return visible.slice(0, MAX_SUGGESTIONS);
}
