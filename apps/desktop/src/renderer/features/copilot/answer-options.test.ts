import { describe, expect, it } from "vitest";
import type { AnswerAction, ChatMessage, Proposal, Suggestion } from "../../ports/copilot-port.ts";
import { answerOptions } from "./answer-options.ts";

const ask = (text: string): Suggestion => ({ text, intent: "ask" });
const user = (id: string, text: string): ChatMessage => ({ id, role: "user", text });
const answer = (id: string, actions: readonly Suggestion[]): ChatMessage => ({
  id,
  role: "copilot",
  text: [{ text: "Done." }],
  actions,
});
const offer = (id: string, answerActions: readonly AnswerAction[], proposalOpen?: boolean): ChatMessage => ({
  id,
  role: "copilot",
  text: [{ text: "Here is a change." }],
  answerActions,
  ...(proposalOpen === undefined ? {} : { proposal: { id: "p1", open: proposalOpen } }),
});
const button = (label: string, kind: AnswerAction["kind"], target: string | null = null): AnswerAction => ({
  label,
  kind,
  target,
});
const proposalCard = (status: Proposal["status"]): ChatMessage => ({
  id: "card",
  role: "proposal",
  proposal: { id: "p1", intro: [], changes: [], warnings: [], editable: false, status },
});

describe("options under copilot answers", () => {
  it("stay live on the latest answer nobody replied to yet", () => {
    const messages = [user("u1", "make it night"), answer("c1", [ask("Add rain")])];
    expect(answerOptions(messages, null).get("c1")).toEqual({ show: "live" });
  });

  it("collapse to the option the person pressed once they replied with it", () => {
    const messages = [answer("c1", [ask("Add rain"), ask("Keep it dry")]), user("u1", " add rain ")];
    expect(answerOptions(messages, null).get("c1")).toEqual({ show: "chosen", label: "Add rain" });
  });

  it("collapse as soon as the pressed option is on its way", () => {
    const messages = [answer("c1", [ask("Add rain")])];
    expect(answerOptions(messages, "Add rain").get("c1")).toEqual({ show: "chosen", label: "Add rain" });
  });

  it("go away when the person typed something else instead, or is sending something else", () => {
    const options = [ask("Add rain")];
    expect(answerOptions([answer("c1", options), user("u1", "taller walls")], null).get("c1")).toEqual({
      show: "none",
    });
    expect(answerOptions([answer("c1", options)], "taller walls").get("c1")).toEqual({ show: "none" });
  });

  it("show the button label of a send action matched by the text it sent", () => {
    const messages = [offer("c1", [button("Add a lamp", "send", "Add a desk lamp")]), user("u1", "Add a desk lamp")];
    expect(answerOptions(messages, null).get("c1")).toEqual({ show: "chosen", label: "Add a lamp" });
  });

  it("are live only on the newest answer when two answers carry options", () => {
    const messages = [answer("c1", [ask("Add rain")]), answer("c2", [ask("Train it")])];
    const options = answerOptions(messages, null);
    expect(options.get("c1")).toEqual({ show: "none" });
    expect(options.get("c2")).toEqual({ show: "live" });
  });

  it("stay live when only cards follow the answer", () => {
    const messages = [
      offer("c1", [button("Apply", "apply"), button("Discard", "discard")], true),
      proposalCard("open"),
    ];
    expect(answerOptions(messages, null).get("c1")).toEqual({ show: "live" });
  });

  it("collapse to Apply or Discard once the proposal was answered, and go away when it went outdated", () => {
    const buttons = [button("Apply", "apply"), button("Discard", "discard")];
    expect(answerOptions([offer("c1", buttons, false), proposalCard("applied")], null).get("c1")).toEqual({
      show: "chosen",
      label: "Apply",
    });
    expect(answerOptions([offer("c1", buttons, false), proposalCard("discarded")], null).get("c1")).toEqual({
      show: "chosen",
      label: "Discard",
    });
    expect(answerOptions([offer("c1", buttons, false), proposalCard("outdated")], null).get("c1")).toEqual({
      show: "none",
    });
  });

  it("treat a next-step plan like an answer", () => {
    const plan: ChatMessage = { id: "pl", role: "plan", plan: { title: "Next", items: [], actions: [ask("Do it")] } };
    expect(answerOptions([plan], null).get("pl")).toEqual({ show: "live" });
    expect(answerOptions([plan, user("u1", "Do it")], null).get("pl")).toEqual({ show: "chosen", label: "Do it" });
  });

  it("leave messages without options out", () => {
    const messages = [
      user("u1", "hi"),
      { id: "c1", role: "copilot", text: [{ text: "Hello." }] } satisfies ChatMessage,
    ];
    expect(answerOptions(messages, null).size).toBe(0);
  });

  it("collapse to Apply and train once its proposal was applied", () => {
    const messages = [offer("a1", [button("Apply and train", "apply_and_train")], false), proposalCard("applied")];
    expect(answerOptions(messages, null).get("a1")).toEqual({ show: "chosen", label: "Apply and train" });
  });
});
