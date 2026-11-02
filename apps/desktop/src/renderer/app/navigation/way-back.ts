import type { ScreenId } from "./catalog-id.ts";
import type { NavigationLocation, NavigationState } from "./navigation-store.tsx";

// The way out of a full-screen page: back to the project and workspace it was opened from, or Home.

export type WayBack = {
  label: string;
  // The history entry to return to, or null to go Home.
  index: number | null;
  to: ScreenId;
};

const LAUNCHER_LABELS: ReadonlyMap<string, string> = new Map([
  ["SCR-HOME", "Back to Home"],
  ["STA-HOME-EMPTY", "Back to Home"],
  ["SCR-PROJECTS", "Back to Projects"],
  ["SCR-COMMUNITY", "Back to Community"],
  ["SCR-CREATION", "Back to creation"],
  ["SCR-PROFILE", "Back to Profile"],
]);

const isSettings = (screen: ScreenId): boolean => screen.startsWith("SCR-SETTINGS-");
const isLauncher = (screen: ScreenId): boolean => LAUNCHER_LABELS.has(screen);

// A workspace of a saved project; one still being created from a template is not a place to return to.
function isProject({ screen, params }: NavigationLocation): boolean {
  return !isSettings(screen) && !isLauncher(screen) && screen.startsWith("SCR-") && params.project !== undefined;
}

function labelOf(location: NavigationLocation): string {
  return isProject(location) ? "Back to project" : (LAUNCHER_LABELS.get(location.screen) ?? "Back");
}

function lastIndex(history: readonly NavigationLocation[], fits: (entry: NavigationLocation) => boolean): number {
  for (let index = history.length - 1; index >= 0; index--) {
    const entry = history[index];
    if (entry && fits(entry)) {
      return index;
    }
  }
  return -1;
}

// Settings always lead back to where they were opened from; the launcher pages lead back to the last project.
export function wayBack({ screen, history }: Pick<NavigationState, "screen" | "history">): WayBack | null {
  if (isSettings(screen)) {
    const index = lastIndex(history, (entry) => isProject(entry) || isLauncher(entry.screen));
    const entry = history[index];
    return entry
      ? { label: labelOf(entry), index, to: entry.screen }
      : { label: "Back to Home", index: null, to: "SCR-HOME" };
  }
  if (isLauncher(screen)) {
    const index = lastIndex(history, isProject);
    const entry = history[index];
    return entry ? { label: labelOf(entry), index, to: entry.screen } : null;
  }
  return null;
}

export function takeWayBack(state: NavigationState, way: WayBack): void {
  if (way.index === null) {
    state.go("SCR-HOME", {});
    return;
  }
  state.returnTo(way.index);
}
