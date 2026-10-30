import { Boxes, Cable, Cog, Layers, Radar } from "lucide-react";
import type { OverlayId, RouteId, ScreenId } from "../../app/navigation/catalog-id.ts";
import type { Workspace } from "../../app/shell/workspace-header/workspace-header.tsx";
import type { ToolGroup } from "../../editor/viewport/toolbar/toolbar.tsx";
import { BRAIN_TOOLS } from "../../editor/viewport/toolbar/toolbar-presets.ts";
import type { SuggestionRoutes } from "../copilot/suggestion-chips.tsx";

// The brain workspace and its states are one screen; each route only changes what it shows.
export type BrainVariant = "learned" | "network" | "connectome";

export const BRAIN_VARIANTS: Readonly<Partial<Record<ScreenId, BrainVariant>>> = {
  "SCR-BRAIN": "learned",
  "STA-BRAIN-NETWORK": "network",
  "STA-BRAIN-CONNECTOME": "connectome",
};

// Tools of a connectome brain, which is inspected and not trained (catalog PNL-TOOLBAR, Brain).
const CONNECTOME_TOOLS: readonly ToolGroup[] = [
  [
    { label: "Neurons", icon: Boxes },
    { label: "Connections", icon: Cable },
    { label: "Regions", icon: Layers },
  ],
  [
    { label: "Senses map", icon: Radar },
    { label: "Motor map", icon: Cog },
  ],
];

export type BrainConfig = {
  // Fixture keys in the brain, scene and copilot ports; in the app they are the open project's documents.
  brain: string;
  scene: string;
  conversation: string;
  project: string;
  placeholder: string;
  tools: readonly ToolGroup[];
  selectedTool: string;
  toolOverrides?: Readonly<Record<string, RouteId | null>>;
  suggestionRoutes: SuggestionRoutes;
  // Where "+ Add a layer" leads; it adds the layer in place when omitted.
  addLayerTo?: RouteId;
  activeGoesTo: RouteId;
  routes?: Partial<Record<Workspace, RouteId>>;
  playTo?: RouteId;
  primary: { label: string; to: RouteId };
};

const PARK = { brain: "park-pilot", scene: "park-pilot-brain", project: "park-pilot" } as const;
const TRAIN = { label: "Train", to: "MOD-START-TRAINING" } as const;

const learned: BrainConfig = {
  ...PARK,
  conversation: "park-pilot-brain",
  placeholder: "Ask how it learns…",
  tools: BRAIN_TOOLS,
  selectedTool: "Senses",
  suggestionRoutes: { explain: "STA-BRAIN-NETWORK", "resize-brain": "MOD-BRAIN-SIZES" },
  activeGoesTo: "SCR-BRAIN",
  primary: TRAIN,
};

const network: BrainConfig = {
  ...PARK,
  conversation: "park-pilot-network",
  placeholder: "Ask about the brain…",
  tools: BRAIN_TOOLS,
  selectedTool: "Network",
  toolOverrides: { Network: null },
  suggestionRoutes: { "resize-brain": "MOD-BRAIN-SIZES", compare: "SCR-RESULTS" },
  addLayerTo: "MOD-BRAIN-SIZES",
  activeGoesTo: "SCR-BRAIN",
  primary: TRAIN,
};

const connectome: BrainConfig = {
  brain: "fruit-fly",
  scene: "fruit-fly",
  conversation: "fruit-fly",
  project: "fruit-fly",
  placeholder: "Ask about the fly brain…",
  tools: CONNECTOME_TOOLS,
  selectedTool: "Neurons",
  suggestionRoutes: { play: "SCR-PLAY.b", compare: "STA-RESULTS-REFERENCE" },
  activeGoesTo: "STA-BRAIN-CONNECTOME",
  routes: { Brain: "STA-BRAIN-CONNECTOME", Results: "STA-RESULTS-REFERENCE" },
  playTo: "SCR-PLAY.b",
  primary: { label: "Run test", to: "STA-RESULTS-REFERENCE" },
};

const CONFIGS: Readonly<Record<BrainVariant, BrainConfig>> = { learned, network, connectome };

// While a dialog is open over the screen, controls that act in place on the screen return to it instead.
const UNDER_OVERLAY: Readonly<Partial<Record<OverlayId, (config: BrainConfig) => BrainConfig>>> = {
  "MOD-BRAIN-SIZES": (config) => ({
    ...config,
    toolOverrides: {},
    suggestionRoutes: { compare: "SCR-RESULTS", explain: "STA-BRAIN-NETWORK" },
    addLayerTo: undefined,
  }),
};

export function brainConfig(variant: BrainVariant, overlay: OverlayId | null): BrainConfig {
  const config = CONFIGS[variant];
  const patch = overlay ? UNDER_OVERLAY[overlay] : undefined;
  return patch ? patch(config) : config;
}
