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

// Where a project opens: the workspace it was left in, World when unknown.
export function lastWorkspace(storage: WorkspaceStorage | null, project: string): ScreenId {
  try {
    const saved = storage?.getItem(keyOf(project));
    return WORKSPACES.find((screen) => screen === saved) ?? DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function keepLastWorkspace(store: StoreApi<NavigationState>, storage: WorkspaceStorage): () => void {
  return store.subscribe(({ screen, params }) => {
    const project = params.project;
    if (!project || !WORKSPACES.includes(screen)) {
      return;
    }
    try {
      storage.setItem(keyOf(project), screen);
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
