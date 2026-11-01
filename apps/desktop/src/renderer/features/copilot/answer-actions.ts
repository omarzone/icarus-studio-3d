import type { RouteId } from "../../app/navigation/catalog-id.ts";
import type { AnswerAction } from "../../ports/copilot-port.ts";

// What pressing a button under a copilot answer does, decided before it is drawn.
export type ActionPlan =
  | { do: "go"; to: RouteId }
  // `used` once the proposal was applied, discarded or outdated: the button stays, disabled.
  | { do: "apply" | "discard"; id: string; used: boolean }
  | { do: "send"; text: string };

export type ActionContext = {
  // The proposal the answer made, if any.
  proposal: { id: string; open: boolean } | null;
  knownRoute: (id: RouteId) => boolean;
};

const TRAINING_DIALOG: RouteId = "MOD-START-TRAINING";

// Only places a person can be sent from the chat: screens, their states, dialogs and popovers.
function isRouteId(value: string): value is RouteId {
  return /^(SCR|STA|MOD|POP)-[A-Z0-9]+(-[A-Z0-9]+)*$/.test(value);
}

// A screen id as written ("SCR-TRAIN"), or a workspace named in words ("train", "World").
function routeOf(target: string | null, knownRoute: ActionContext["knownRoute"]): RouteId | null {
  const name = target?.trim() ?? "";
  const candidates = [name, `SCR-${name.toUpperCase()}`];
  return candidates.find((id): id is RouteId => isRouteId(id) && knownRoute(id)) ?? null;
}

// null when the button cannot do anything here (an unknown screen, no proposal): it is not drawn.
export function planAction(action: AnswerAction, { proposal, knownRoute }: ActionContext): ActionPlan | null {
  switch (action.kind) {
    case "navigate": {
      const to = routeOf(action.target, knownRoute);
      return to ? { do: "go", to } : null;
    }
    case "train":
      return knownRoute(TRAINING_DIALOG) ? { do: "go", to: TRAINING_DIALOG } : null;
    case "apply":
    case "discard":
      return proposal ? { do: action.kind, id: proposal.id, used: !proposal.open } : null;
    case "send": {
      const text = action.target?.trim() ?? "";
      return { do: "send", text: text === "" ? action.label : text };
    }
  }
}
