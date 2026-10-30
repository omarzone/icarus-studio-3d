import type { GuideProgress } from "../ports/scene-port.ts";

// Header guide label: "Getting started n/5" while the guide is active, "Guide" when hidden.
export function guideLabel(guide: GuideProgress | undefined): string {
  return guide?.started ? `Getting started ${guide.done}/${guide.total}` : "Guide";
}
