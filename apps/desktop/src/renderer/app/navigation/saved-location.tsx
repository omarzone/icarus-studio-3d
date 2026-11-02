import { useContext, useEffect } from "react";
import type { StoreApi } from "zustand";
import type { ScreenId } from "./catalog-id.ts";
import {
  NavigationContext,
  type NavigationLocation,
  type NavigationStart,
  type NavigationState,
  type RouteParams,
} from "./navigation-store.tsx";

type LocationStorage = Pick<Storage, "getItem" | "setItem">;

const KEY = "icarus.location";
const SCREEN = /^(SCR|STA|REF)-[A-Z0-9.-]+$/;
// Enough of the way back to leave settings and the launcher pages for the project they were opened from.
const KEPT_HISTORY = 30;

function isParams(value: unknown): value is RouteParams {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}

function isScreen(value: unknown): value is ScreenId {
  return typeof value === "string" && SCREEN.test(value);
}

function readLocation(value: unknown): NavigationLocation | null {
  if (typeof value === "object" && value !== null && "screen" in value && "params" in value) {
    const { screen, params } = value;
    if (isScreen(screen) && isParams(params)) {
      return { screen, overlay: null, params };
    }
  }
  return null;
}

// Where the person was before the window reloaded or the engine restarted, and the way back; dialogs are not reopened.
export function savedLocation(storage: LocationStorage, fallback: NavigationLocation): NavigationStart {
  try {
    const saved: unknown = JSON.parse(storage.getItem(KEY) ?? "null");
    const here = readLocation(saved);
    if (here) {
      const kept = typeof saved === "object" && saved !== null && "history" in saved ? saved.history : [];
      const history = Array.isArray(kept) ? kept.map(readLocation).filter((entry) => entry !== null) : [];
      return { ...here, history };
    }
  } catch {
    // An unreadable entry is the same as none.
  }
  return fallback;
}

export function keepLocation(store: StoreApi<NavigationState>, storage: LocationStorage): () => void {
  return store.subscribe(({ screen, params, history }) => {
    try {
      const way = history.slice(-KEPT_HISTORY).map((entry) => ({ screen: entry.screen, params: entry.params }));
      storage.setItem(KEY, JSON.stringify({ screen, params, history: way }));
    } catch {
      // Storage can be full or blocked; navigation keeps working without it.
    }
  });
}

// Saves every move of the open window, so a reload or an engine restart comes back to the same place.
export function RememberLocation({ storage }: { storage: LocationStorage }) {
  const store = useContext(NavigationContext);
  useEffect(() => (store ? keepLocation(store, storage) : undefined), [store, storage]);
  return null;
}
