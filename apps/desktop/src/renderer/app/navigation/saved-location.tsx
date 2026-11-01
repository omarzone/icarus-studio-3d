import { useContext, useEffect } from "react";
import type { StoreApi } from "zustand";
import type { ScreenId } from "./catalog-id.ts";
import {
  NavigationContext,
  type NavigationLocation,
  type NavigationState,
  type RouteParams,
} from "./navigation-store.tsx";

type LocationStorage = Pick<Storage, "getItem" | "setItem">;

const KEY = "icarus.location";
const SCREEN = /^(SCR|STA|REF)-[A-Z0-9.-]+$/;

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

// Where the person was before the window reloaded or the engine restarted; dialogs are not reopened.
export function savedLocation(storage: LocationStorage, fallback: NavigationLocation): NavigationLocation {
  try {
    const saved: unknown = JSON.parse(storage.getItem(KEY) ?? "null");
    if (typeof saved === "object" && saved !== null && "screen" in saved && "params" in saved) {
      const { screen, params } = saved;
      if (isScreen(screen) && isParams(params)) {
        return { screen, overlay: null, params };
      }
    }
  } catch {
    // An unreadable entry is the same as none.
  }
  return fallback;
}

export function keepLocation(store: StoreApi<NavigationState>, storage: LocationStorage): () => void {
  return store.subscribe(({ screen, params }) => {
    try {
      storage.setItem(KEY, JSON.stringify({ screen, params }));
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
