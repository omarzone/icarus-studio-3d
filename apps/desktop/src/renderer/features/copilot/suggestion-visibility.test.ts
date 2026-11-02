import { describe, expect, it } from "vitest";
import type { ChatMessage, Suggestion } from "../../ports/copilot-port.ts";
import { visibleSuggestions } from "./suggestion-visibility.ts";

const ask = (text: string): Suggestion => ({ text, intent: "ask" });
const user = (id: string, text: string): ChatMessage => ({ id, role: "user", text });
const answer = (id: string, actions?: Suggestion[]): ChatMessage => ({
  id,
  role: "copilot",
  text: [{ text: "Done." }],
  ...(actions ? { actions } : {}),
});

describe("suggestions under the chat", () => {
  it("follow the latest copilot answer", () => {
    const messages = [user("u1", "make it night"), answer("c1")];
    expect(visibleSuggestions({ messages, suggestions: [ask("Add rain")] }, false)).toEqual([ask("Add rain")]);
  });

  it("disappear while a message is on its way", () => {
    const messages = [user("u1", "make it night"), answer("c1")];
    expect(visibleSuggestions({ messages, suggestions: [ask("Add rain")] }, true)).toEqual([]);
  });

  it("disappear when the last word is the user's, so old suggestions never sit under a new question", () => {
    const messages = [answer("c1"), user("u1", "and taller?")];
    expect(visibleSuggestions({ messages, suggestions: [ask("Add rain")] }, false)).toEqual([]);
  });

  it("never repeat a suggestion, an inline action of the answer or a question already asked", () => {
    const messages = [user("u1", "Add rain"), answer("c1", [ask("Train it")])];
    const suggestions = [ask("Add rain"), ask("Night time"), ask(" night time "), ask("Train it"), ask("Why?")];
    expect(visibleSuggestions({ messages, suggestions }, false).map((item) => item.text)).toEqual([
      "Night time",
      "Why?",
    ]);
  });

  it("show at most four and keep a conversation with no messages yet open to starters", () => {
    const suggestions = ["a", "b", "c", "d", "e"].map(ask);
    expect(visibleSuggestions({ messages: [], suggestions }, false).map((item) => item.text)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });
});
