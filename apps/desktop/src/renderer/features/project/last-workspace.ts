import { useContext, useEffect } from "react";
import type { StoreApi } from "zustand";
import type { ScreenId } from "../../app/navigation/catalog-id.ts";
import { NavigationContext, type NavigationState } from "../../app/navigation/navigation-store.tsx";

type WorkspaceStorage = Pick<Storage, "getItem" | "setItem">;

const WORKSPACES: readonly ScreenId[] = [
  "SCR-WORLD",
  "SCR-BODY",
  "SCR-MOTION",
  "SCR-BRAIN",
  "SCR-TRAIN",
  "SCR-RESULTS",
  "SCR-BUILD",
];
const DEFAULT: ScreenId = "SCR-WORLD";

const keyOf = (project: string): string => `icarus.workspace.${project}`;
const openedKeyOf = (project: string): string => `icarus.opened.${project}`;

// Where a project opens: the workspace it was left in, World when unknown.
export function lastWorkspace(storage: WorkspaceStorage | null, project: string): ScreenId {
  try {
    const saved = storage?.getItem(keyOf(project));
    return WORKSPACES.find((screen) => screen === saved) ?? DEFAULT;
  } catch {
    return DEFAULT;
  }
}

// When a project was last opened (milliseconds since the epoch), null when unknown.
export function lastOpened(storage: WorkspaceStorage | null, project: string): number | null {
  try {
    const saved = Number(storage?.getItem(openedKeyOf(project)));
    return Number.isFinite(saved) && saved > 0 ? saved : null;
  } catch {
    return null;
  }
}

export function keepLastWorkspace(
  store: StoreApi<NavigationState>,
  storage: WorkspaceStorage,
  now: () => number = Date.now,
): () => void {
  return store.subscribe(({ screen, params }, previous) => {
    const project = params.project;
    if (!project || !WORKSPACES.includes(screen)) {
      return;
    }
    try {
      storage.setItem(keyOf(project), screen);
      if (previous.params.project !== project || !WORKSPACES.includes(previous.screen)) {
        storage.setItem(openedKeyOf(project), String(now()));
      }
    } catch {
      // Storage can be full or blocked; projects then open in World.
    }
  });
}

// Browser storage itself can throw when site data is blocked.
export function workspaceStorage(): WorkspaceStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function RememberWorkspace() {
  const store = useContext(NavigationContext);
  useEffect(() => {
    const storage = workspaceStorage();
    return store && storage ? keepLastWorkspace(store, storage) : undefined;
  }, [store]);
  return null;
}
