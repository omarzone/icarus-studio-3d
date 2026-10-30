import type { OverlayId, RouteId, ScreenId } from "../../app/navigation/catalog-id.ts";
import type { ToolGroup } from "../../editor/viewport/toolbar/toolbar.tsx";
import { BODY_TOOLS } from "../../editor/viewport/toolbar/toolbar-presets.ts";
import type { SuggestionRoutes } from "../copilot/suggestion-chips.tsx";

// The body workspace and its states are one screen; each route only changes what it shows.
export type BodyVariant = "rig" | "check-failed" | "new";

export const BODY_VARIANTS: Readonly<Partial<Record<ScreenId, BodyVariant>>> = {
  "SCR-BODY": "rig",
  "STA-BODY-CHECK-FAILED": "check-failed",
};

export type BodyConfig = {
  // Fixture keys in the body, scene and copilot ports; in the app they are the open project's documents.
  body: string;
  scene: string;
  conversation: string;
  explorerLabel: string;
  placeholder: string;
  tools: readonly ToolGroup[];
  selectedTool: string;
  toolOverrides?: Readonly<Record<string, RouteId | null>>;
  suggestionRoutes: SuggestionRoutes;
  // A body that exists has bones and components; before import only the workspace shows.
  rigged: boolean;
};

const rig: BodyConfig = {
  body: "dance-copy",
  scene: "dance-copy-rig",
  conversation: "dance-copy-body",
  explorerLabel: "Rig",
  placeholder: "Describe a change to the body…",
  tools: BODY_TOOLS,
  selectedTool: "Bone",
  suggestionRoutes: { "apply-fix": "MOD-AUTO-RIG", "motion-video": "MOD-MOTION-VIDEO" },
  rigged: true,
};

// Before a model is imported only the first body tools apply.
const NEW_BODY_TOOLS: readonly ToolGroup[] = [BODY_TOOLS[0] ?? [], (BODY_TOOLS[1] ?? []).slice(0, 2)];

const fresh: BodyConfig = {
  body: "dance-copy",
  scene: "dance-copy-new",
  conversation: "dance-copy-import",
  explorerLabel: "Explorer",
  placeholder: "Ask anything…",
  tools: NEW_BODY_TOOLS,
  selectedTool: "Import",
  toolOverrides: { Import: null },
  suggestionRoutes: { template: "SCR-HOME" },
  rigged: false,
};

const SETTLED_IN_PLACE: SuggestionRoutes = {
  show: "SCR-BODY",
  "propose-change": "SCR-BODY",
  "motion-video": "MOD-MOTION-VIDEO",
};
const SETTLED: SuggestionRoutes = { ...SETTLED_IN_PLACE, "apply-fix": "MOD-AUTO-RIG" };

const CONFIGS: Readonly<Record<BodyVariant, BodyConfig>> = {
  rig,
  "check-failed": { ...rig, body: "dance-copy-failed", suggestionRoutes: SETTLED },
  new: fresh,
};

// While a dialog is open over the screen, controls that act in place on the screen return to it instead.
const UNDER_OVERLAY: Readonly<Partial<Record<OverlayId, (config: BodyConfig) => BodyConfig>>> = {
  "MOD-AUTO-RIG": (config) => ({
    ...config,
    toolOverrides: { "Auto-rig": null },
    suggestionRoutes: SETTLED_IN_PLACE,
  }),
  // Importing shows the project as it was before the model came in.
  "MOD-IMPORT": () => fresh,
};

export function bodyConfig(variant: BodyVariant, overlay: OverlayId | null): BodyConfig {
  const config = CONFIGS[variant];
  const patch = overlay ? UNDER_OVERLAY[overlay] : undefined;
  return patch ? patch(config) : config;
}
