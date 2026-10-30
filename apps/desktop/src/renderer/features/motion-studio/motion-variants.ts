import type { OverlayId, RouteId, ScreenId } from "../../app/navigation/catalog-id.ts";
import type { SuggestionRoutes } from "../copilot/suggestion-chips.tsx";

// The motion workspace and its training state are one screen; each route only changes what it shows.
export type MotionVariant = "compare" | "training";

export const MOTION_VARIANTS: Readonly<Partial<Record<ScreenId, MotionVariant>>> = {
  "SCR-MOTION": "compare",
  "STA-MOTION-TRAINING": "training",
};

export type MotionConfig = {
  // Fixture keys in the motion, scene and copilot ports; in the app they are the open project's documents.
  clip: string;
  scene: string;
  conversation: string;
  toolOverrides: Readonly<Record<string, RouteId | null>>;
  suggestionRoutes: SuggestionRoutes;
  primary: { label: string; to: RouteId };
};

const EXPORT_ROUTES: SuggestionRoutes = { export: "MOD-EXPORT-ANIMATION" };
// Away from the comparison (a dialog, or training), acting on the clip returns to the comparison first.
const BACK_TO_COMPARE: SuggestionRoutes = {
  ...EXPORT_ROUTES,
  "train-run": "SCR-MOTION",
  "propose-change": "SCR-MOTION",
};
const TRIM: Readonly<Record<string, RouteId | null>> = { Trim: "MOD-MOTION-VIDEO" };
const TRAIN_COPY = { label: "Train copy", to: "MOD-MOTION-TRAIN" } as const;

const compare: MotionConfig = {
  clip: "dance-copy",
  scene: "dance-copy-clip",
  conversation: "dance-copy-motion",
  toolOverrides: TRIM,
  suggestionRoutes: EXPORT_ROUTES,
  primary: TRAIN_COPY,
};

const CONFIGS: Readonly<Record<MotionVariant, MotionConfig>> = {
  compare,
  training: { ...compare, suggestionRoutes: BACK_TO_COMPARE, primary: { label: "Stop", to: "MOD-STOP-RUN" } },
};

const UNDER_OVERLAY: Readonly<Partial<Record<OverlayId, (config: MotionConfig) => MotionConfig>>> = {
  "MOD-MOTION-TRACKING": (config) => ({
    ...config,
    toolOverrides: { ...TRIM, "Detect pose": null },
    suggestionRoutes: BACK_TO_COMPARE,
  }),
  "MOD-MOTION-TRAIN": (config) => ({ ...config, suggestionRoutes: BACK_TO_COMPARE }),
  "MOD-EXPORT-ANIMATION": (config) => ({
    ...config,
    toolOverrides: { ...TRIM, Export: null },
    suggestionRoutes: { "train-run": "SCR-MOTION", "propose-change": "SCR-MOTION" },
  }),
};

export function motionConfig(variant: MotionVariant, overlay: OverlayId | null): MotionConfig {
  const config = CONFIGS[variant];
  const patch = overlay ? UNDER_OVERLAY[overlay] : undefined;
  return patch ? patch(config) : config;
}
