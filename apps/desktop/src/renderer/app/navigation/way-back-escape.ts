import { useEffect } from "react";
import type { StoreApi } from "zustand";
import type { NavigationState } from "./navigation-store.tsx";
import { takeWayBack, wayBack } from "./way-back.ts";

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT")
  );
}

// Escape leaves settings and the launcher pages the way their back control does, once dialogs, menus and fields
// have had it.
export function useWayBackEscape(store: StoreApi<NavigationState>): void {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const state = store.getState();
      if (event.key !== "Escape" || event.defaultPrevented || state.overlay !== null || isEditable(event.target)) {
        return;
      }
      const way = wayBack(state);
      if (way) {
        event.preventDefault();
        takeWayBack(state, way);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [store]);
}
