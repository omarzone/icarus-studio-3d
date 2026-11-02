import type { ScreenId } from "../../../app/navigation/catalog-id.ts";
import type { NavigationLocation, RouteParams } from "../../../app/navigation/navigation-store.tsx";

const PLAY: ScreenId = "SCR-PLAY";

// Where Stop leads: the newest earlier screen that is not Play, or the workspace Play belongs to.
export function playExit(
  history: readonly NavigationLocation[],
  fallback: ScreenId,
  params: RouteParams = {},
): NavigationLocation {
  const earlier = history.findLast((location) => location.screen !== PLAY);
  return earlier ?? { screen: fallback, overlay: null, params };
}
