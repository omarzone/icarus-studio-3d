import type { RouteId, ScreenId } from "../../app/navigation/catalog-id.ts";
import type { Workspace } from "../../app/shell/workspace-header/workspace-header.tsx";
import type { SuggestionRoutes } from "../copilot/suggestion-chips.tsx";

// The Results workspace and its states are one screen; each route only changes what it shows.
export type ResultsVariant = "compare" | "failures" | "reference";

export const RESULTS_VARIANTS: Readonly<Partial<Record<ScreenId, ResultsVariant>>> = {
  "SCR-RESULTS": "compare",
  "STA-RESULTS-FAILURES": "failures",
  "STA-RESULTS-REFERENCE": "reference",
};

export type ResultsConfig = {
  // Example project shown when no project is open (gallery, prototype start).
  project: string;
  // Sample scene whose guide progress the header shows in the prototype; the app uses the open project.
  scene: string;
  conversation: string;
  placeholder: string;
  suggestionRoutes: SuggestionRoutes;
  activeGoesTo: RouteId;
  primary: { label: string; to: RouteId };
  routes?: Partial<Record<Workspace, RouteId>>;
  playTo?: RouteId;
};

const TRAIN = { label: "Train", to: "MOD-START-TRAINING" } as const;

export const RESULTS_CONFIGS: Readonly<Record<ResultsVariant, ResultsConfig>> = {
  compare: {
    project: "park-pilot",
    scene: "park-pilot-results",
    conversation: "park-pilot-results",
    placeholder: "Ask about the results…",
    suggestionRoutes: { diagnose: "STA-RESULTS-FAILURES", share: "MOD-SHARE", "train-run": "MOD-START-TRAINING" },
    activeGoesTo: "SCR-RESULTS",
    primary: TRAIN,
  },
  failures: {
    project: "park-pilot",
    scene: "park-pilot-results",
    conversation: "park-pilot-failures",
    placeholder: "Ask about the failures…",
    suggestionRoutes: { "apply-fix": "SCR-BRAIN", "train-run": "MOD-START-TRAINING" },
    activeGoesTo: "SCR-RESULTS",
    primary: TRAIN,
  },
  reference: {
    project: "fruit-fly",
    scene: "fruit-fly-results",
    conversation: "fruit-fly-reference",
    placeholder: "Ask about the comparison…",
    suggestionRoutes: {
      "apply-fix": "STA-BRAIN-CONNECTOME",
      share: "MOD-PUBLISH",
      explain: "STA-BRAIN-CONNECTOME",
      record: "SCR-TIMELAPSE",
    },
    activeGoesTo: "STA-RESULTS-REFERENCE",
    primary: { label: "Run test", to: "STA-RESULTS-REFERENCE" },
    routes: { Brain: "STA-BRAIN-CONNECTOME" },
    playTo: "SCR-PLAY.b",
  },
};
