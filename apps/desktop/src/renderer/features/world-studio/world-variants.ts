import type { RouteId, ScreenId } from "../../app/navigation/catalog-id.ts";
import type { ToolGroup } from "../../editor/viewport/toolbar/toolbar.tsx";
import { NEW_PROJECT_TOOLS, WORLD_BUILDING_TOOLS, WORLD_TOOLS } from "../../editor/viewport/toolbar/toolbar-presets.ts";
import type { ProposalRoutes } from "../copilot/proposal-card.tsx";
import type { SuggestionRoutes } from "../copilot/suggestion-chips.tsx";

// The World workspace and its states are one screen; each route only changes what it shows.
export type WorldVariant = "world" | "empty" | "empty-noguide" | "building" | "proposal";

export const WORLD_VARIANTS: Readonly<Partial<Record<ScreenId, WorldVariant>>> = {
  "SCR-WORLD": "world",
  "STA-WORLD-EMPTY": "empty",
  "STA-WORLD-EMPTY-NOGUIDE": "empty-noguide",
  "STA-WORLD-BUILDING": "building",
  "STA-WORLD-PROPOSAL": "proposal",
};

export type WorldConfig = {
  // Scene key in the scene, library and build ports; in the app it is the open project's document.
  scene: string;
  conversation: string;
  // Whether a project exists yet (a new project shows the generic "Untitled project").
  hasProject: boolean;
  tools: readonly ToolGroup[];
  selectedTool?: string;
  placeholder: string;
  suggestionRoutes: SuggestionRoutes;
  proposalRoutes?: ProposalRoutes;
  importLabel?: string;
  activeGoesTo?: RouteId;
  playEnabled: boolean;
  trainEnabled: boolean;
};

const WORLD_CHANGE = "Describe a change to the world…";
const ENVIRONMENT_IMPORT = "Import environment .glb .fbx .usd";

const world: WorldConfig = {
  scene: "park-pilot",
  conversation: "park-pilot",
  hasProject: true,
  tools: WORLD_TOOLS,
  selectedTool: "Copies",
  placeholder: WORLD_CHANGE,
  suggestionRoutes: { "propose-change": "STA-WORLD-PROPOSAL" },
  importLabel: ENVIRONMENT_IMPORT,
  activeGoesTo: "SCR-WORLD",
  playEnabled: true,
  trainEnabled: true,
};

const empty: WorldConfig = {
  scene: "new-project",
  conversation: "new-project",
  hasProject: false,
  tools: NEW_PROJECT_TOOLS,
  selectedTool: "Sky",
  placeholder: "Describe your idea…",
  suggestionRoutes: { "new-idea": "SCR-IDEAS", import: "MOD-IMPORT", "motion-video": "MOD-MOTION-VIDEO" },
  importLabel: "Import a model or environment",
  activeGoesTo: "SCR-WORLD",
  playEnabled: true,
  trainEnabled: false,
};

export const WORLD_CONFIGS: Readonly<Record<WorldVariant, WorldConfig>> = {
  world,
  empty,
  "empty-noguide": empty,
  building: {
    scene: "park-pilot-building",
    conversation: "park-pilot-building",
    hasProject: true,
    tools: WORLD_BUILDING_TOOLS,
    placeholder: "You can keep chatting while it builds…",
    suggestionRoutes: { "propose-change": "STA-WORLD-PROPOSAL", "new-idea": "SCR-IDEAS" },
    activeGoesTo: "SCR-WORLD",
    playEnabled: false,
    trainEnabled: false,
  },
  proposal: {
    ...world,
    conversation: "park-pilot-proposal",
    suggestionRoutes: {},
    proposalRoutes: { apply: "SCR-WORLD", discard: "SCR-WORLD", edit: "SCR-WORLD" },
  },
};
