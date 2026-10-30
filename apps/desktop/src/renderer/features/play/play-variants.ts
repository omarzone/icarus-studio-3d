import type { ScreenId } from "../../app/navigation/catalog-id.ts";
import type { SuggestionRoutes } from "../copilot/suggestion-chips.tsx";

// Play has one screen; each example route only changes the project it plays and where Stop returns.
export type PlayVariant = "learned" | "connectome";

export const PLAY_VARIANTS: Readonly<Partial<Record<ScreenId, PlayVariant>>> = {
  "SCR-PLAY": "learned",
  "SCR-PLAY.b": "connectome",
};

export type PlayConfig = {
  // Example project shown when no project is open (gallery, prototype start).
  project: string;
  conversation: string;
  returnTo: ScreenId;
  suggestionRoutes: SuggestionRoutes;
};

const PLAY_ROUTES: SuggestionRoutes = { record: "SCR-TIMELAPSE", "add-to-training": "POP-TRAINING-COPIES" };

export const PLAY_CONFIGS: Readonly<Record<PlayVariant, PlayConfig>> = {
  learned: {
    project: "park-pilot",
    conversation: "park-pilot-play",
    returnTo: "SCR-WORLD",
    suggestionRoutes: PLAY_ROUTES,
  },
  connectome: {
    project: "fruit-fly",
    conversation: "fruit-fly-play",
    returnTo: "STA-BRAIN-CONNECTOME",
    suggestionRoutes: PLAY_ROUTES,
  },
};
