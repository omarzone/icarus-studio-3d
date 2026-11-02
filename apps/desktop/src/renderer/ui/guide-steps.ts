import type { RouteId } from "../app/navigation/catalog-id.ts";
import type { GuideStep, GuideStepId } from "../ports/scene-port.ts";

// What the next click on a getting-started step does: send a request to the copilot, or open a screen.
export type GuideAction = { kind: "ask"; label: string; message: string } | { kind: "go"; label: string; to: RouteId };

export type GuideStepView = {
  id: GuideStepId;
  label: string;
  detail: string;
  done: boolean;
  action: GuideAction | null;
};

const ASK: Readonly<Record<Exclude<GuideStepId, "trained">, { label: string; detail: string; action: GuideAction }>> = {
  body: {
    label: "Give it a body",
    detail: "Something that can move and sense, like a small car.",
    action: {
      kind: "ask",
      label: "Ask the copilot for a body",
      message: "Add a simple body that can move and sense the world around it.",
    },
  },
  goal: {
    label: "Give it a goal",
    detail: "A place in the world it should reach.",
    action: {
      kind: "ask",
      label: "Ask the copilot to add a goal",
      message: "Add a goal zone the body should learn to reach.",
    },
  },
  rewards: {
    label: "Reward what it should learn",
    detail: "Points for good moves and penalties for bad ones; this is how it learns.",
    action: {
      kind: "ask",
      label: "Ask the copilot for rewards",
      message: "Add rewards so it learns to reach the goal without crashing.",
    },
  },
};

const TRAIN: GuideAction = { kind: "go", label: "Train now", to: "MOD-START-TRAINING" };
const WATCH: GuideAction = { kind: "go", label: "Watch it train", to: "SCR-TRAIN" };
const PLAY: GuideAction = { kind: "go", label: "Try the trained brain in Play", to: "SCR-PLAY" };

function view(step: GuideStep): GuideStepView {
  if (step.id === "trained") {
    return {
      id: step.id,
      label: "Train it",
      detail: step.training
        ? "It is practicing now, in many copies of the world at once."
        : "It practices over many tries and keeps the best brain it finds.",
      done: step.done,
      action: step.done ? null : step.training ? WATCH : TRAIN,
    };
  }
  const { label, detail, action } = ASK[step.id];
  return { id: step.id, label, detail, done: step.done, action: step.done ? null : action };
}

export function guideStepViews(steps: readonly GuideStep[]): GuideStepView[] {
  return steps.map(view);
}

// The one thing to do next: the first open step, or trying the result in Play once all are done.
export function nextGuideAction(steps: readonly GuideStep[]): GuideAction | null {
  const views = guideStepViews(steps);
  if (views.every((item) => item.done)) {
    return PLAY;
  }
  return views.find((item) => !item.done)?.action ?? null;
}
