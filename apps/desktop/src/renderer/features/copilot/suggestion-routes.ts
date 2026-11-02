import type { RouteId } from "../../app/navigation/catalog-id.ts";
import type { Suggestion, SuggestionIntent } from "../../ports/copilot-port.ts";

export type SuggestionRoutes = Partial<Record<SuggestionIntent, RouteId>>;

// What pressing a chip does in the app: where it leads, and the text it sends to the copilot there.
export type ChipPlan = { go: RouteId | null; send: string | null };

// Where each intent leads when the workspace names no destination, best screen first.
const APP_ROUTES: Partial<Record<SuggestionIntent, readonly RouteId[]>> = {
  diagnose: ["STA-RESULTS-FAILURES", "SCR-RESULTS"],
  compare: ["SCR-RESULTS"],
  "train-run": ["MOD-START-TRAINING"],
  "stop-run": ["MOD-STOP-RUN"],
  play: ["SCR-PLAY"],
  show: ["SCR-WORLD"],
};

// Intents whose screen or dialog does the whole job, so nothing is sent.
const NAVIGATE_ONLY: ReadonlySet<SuggestionIntent> = new Set(["train-run", "stop-run", "play"]);

export function chipPlan(
  suggestion: Suggestion,
  routes: SuggestionRoutes,
  knownRoute: (id: RouteId) => boolean,
): ChipPlan {
  const own = routes[suggestion.intent];
  const candidates = [...(own ? [own] : []), ...(APP_ROUTES[suggestion.intent] ?? [])];
  const go = candidates.find(knownRoute) ?? null;
  if (go === null) {
    return { go: null, send: suggestion.text };
  }
  const workspaceOnly = own === go && APP_ROUTES[suggestion.intent] === undefined;
  return { go, send: NAVIGATE_ONLY.has(suggestion.intent) || workspaceOnly ? null : suggestion.text };
}
