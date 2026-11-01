import type { ScreenId } from "../../app/navigation/catalog-id.ts";
import type { SuggestionRoutes } from "../copilot/suggestion-chips.tsx";

// The Train workspace and its failed state are one screen; the route only adds the failure card.
export type TrainVariant = "live" | "failed";

export const TRAIN_VARIANTS: Readonly<Partial<Record<ScreenId, TrainVariant>>> = {
  "SCR-TRAIN": "live",
  "STA-TRAIN-FAILED": "failed",
};

export const TRAIN_CONFIG = {
  // Example project shown when no project is open (gallery, prototype start).
  project: "park-pilot",
  // Scene key of the selected run in the inspector.
  scene: "park-pilot-run",
  conversation: "park-pilot-train",
  suggestionRoutes: {
    "train-run": "MOD-START-TRAINING",
    explain: "STA-BRAIN-NETWORK",
    diagnose: "STA-RESULTS-FAILURES",
    compare: "SCR-RESULTS",
    "stop-run": "MOD-STOP-RUN",
  } satisfies SuggestionRoutes,
} as const;
