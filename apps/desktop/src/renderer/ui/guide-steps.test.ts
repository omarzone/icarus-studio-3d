import { describe, expect, it } from "vitest";
import type { GuideStep } from "../ports/scene-port.ts";
import { guideStepViews, nextGuideAction } from "./guide-steps.ts";

const steps = (done: Partial<Record<GuideStep["id"], boolean>>, training = false): GuideStep[] => [
  { id: "body", done: done.body ?? false },
  { id: "goal", done: done.goal ?? false },
  { id: "rewards", done: done.rewards ?? false },
  training ? { id: "trained", done: false, training } : { id: "trained", done: done.trained ?? false },
];

describe("guideStepViews", () => {
  it("offers to ask the copilot for each missing part of the design", () => {
    const views = guideStepViews(steps({}));
    expect(views.map((view) => view.action?.kind)).toEqual(["ask", "ask", "ask", "go"]);
    expect(views[1]?.action).toMatchObject({ kind: "ask", label: "Ask the copilot to add a goal" });
  });

  it("drops the action of a step that is done", () => {
    expect(guideStepViews(steps({ body: true }))[0]?.action).toBeNull();
  });

  it("opens the start dialog to train, or the Train workspace while a run is learning", () => {
    expect(guideStepViews(steps({}))[3]?.action).toEqual({ kind: "go", label: "Train now", to: "MOD-START-TRAINING" });
    expect(guideStepViews(steps({}, true))[3]?.action).toEqual({
      kind: "go",
      label: "Watch it train",
      to: "SCR-TRAIN",
    });
  });
});

describe("nextGuideAction", () => {
  it("is the first step still to do, in order", () => {
    expect(nextGuideAction(steps({ body: true }))?.label).toBe("Ask the copilot to add a goal");
  });

  it("is Play once everything is done", () => {
    expect(nextGuideAction(steps({ body: true, goal: true, rewards: true, trained: true }))).toEqual({
      kind: "go",
      label: "Try the trained brain in Play",
      to: "SCR-PLAY",
    });
  });
});
