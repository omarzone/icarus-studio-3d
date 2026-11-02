import { describe, expect, it } from "vitest";
import type { RouteId } from "../../app/navigation/catalog-id.ts";
import type { AnswerAction } from "../../ports/copilot-port.ts";
import { type ActionContext, planAction } from "./answer-actions.ts";

const ROUTES = new Set<RouteId>(["SCR-WORLD", "SCR-TRAIN", "STA-RESULTS-FAILURES", "MOD-START-TRAINING"]);

const context = (proposal: ActionContext["proposal"] = null): ActionContext => ({
  proposal,
  knownRoute: (id) => ROUTES.has(id),
});

const action = (kind: AnswerAction["kind"], target: string | null = null): AnswerAction => ({
  label: "Do it",
  kind,
  target,
});

describe("answer actions", () => {
  it("navigates to a known screen id", () => {
    expect(planAction(action("navigate", "STA-RESULTS-FAILURES"), context())).toEqual({
      do: "go",
      to: "STA-RESULTS-FAILURES",
    });
  });

  it("navigates to a workspace named in words", () => {
    expect(planAction(action("navigate", "train"), context())).toEqual({ do: "go", to: "SCR-TRAIN" });
    expect(planAction(action("navigate", " World "), context())).toEqual({ do: "go", to: "SCR-WORLD" });
  });

  it("drops navigation to unknown or malformed targets", () => {
    expect(planAction(action("navigate", "SCR-NOWHERE"), context())).toBeNull();
    expect(planAction(action("navigate", "https://example.com"), context())).toBeNull();
    expect(planAction(action("navigate", "../settings"), context())).toBeNull();
    expect(planAction(action("navigate", "SYS-ENGINE-DOWN"), context())).toBeNull();
    expect(planAction(action("navigate"), context())).toBeNull();
  });

  it("opens the start training dialog to train", () => {
    expect(planAction(action("train"), context())).toEqual({ do: "go", to: "MOD-START-TRAINING" });
  });

  it("acts on the message's proposal and marks it used once answered", () => {
    expect(planAction(action("apply"), context({ id: "p1", open: true }))).toEqual({
      do: "apply",
      id: "p1",
      used: false,
    });
    expect(planAction(action("discard"), context({ id: "p1", open: false }))).toEqual({
      do: "discard",
      id: "p1",
      used: true,
    });
  });

  it("drops apply and discard when the message made no proposal", () => {
    expect(planAction(action("apply"), context())).toBeNull();
    expect(planAction(action("discard"), context())).toBeNull();
  });

  it("sends the target as the next message, or the label when there is none", () => {
    expect(planAction(action("send", "Add a lamp"), context())).toEqual({ do: "send", text: "Add a lamp" });
    expect(planAction(action("send"), context())).toEqual({ do: "send", text: "Do it" });
    expect(planAction(action("send", "   "), context())).toEqual({ do: "send", text: "Do it" });
  });

  it("selects the object to show, or opens the World view when it names none", () => {
    expect(planAction(action("show", " car "), context())).toEqual({ do: "show", target: "car" });
    expect(planAction(action("show"), context())).toEqual({ do: "go", to: "SCR-WORLD" });
  });

  it("hides the answer's options to dismiss", () => {
    expect(planAction(action("dismiss"), context())).toEqual({ do: "dismiss" });
  });

  it("applies the proposal then opens the start training dialog", () => {
    expect(planAction(action("apply_and_train"), context({ id: "p1", open: true }))).toEqual({
      do: "apply_and_train",
      id: "p1",
      used: false,
    });
    expect(planAction(action("apply_and_train"), context())).toBeNull();
  });
});
