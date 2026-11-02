import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createStore, type StoreApi } from "zustand";
import { Notices } from "../../ui/notices.tsx";
import { LoadingState } from "../../ui/states.tsx";
import type { ScreenId } from "./catalog-id.ts";
import { NavigationContext, type NavigationState, useNavigation, useNavigationStore } from "./navigation-store.tsx";
import { NotBuiltYet } from "./not-built-yet.tsx";
import { catalog } from "./route-registry.ts";
import { useWayBackEscape } from "./way-back-escape.ts";

// Longest a new screen stays hidden while its data loads; after that it shows its own loading states.
const SWAP_TIMEOUT_MS = 300;

export function Router() {
  const store = useNavigationStore();
  useWayBackEscape(store);
  const screen = useNavigation((state) => state.screen);
  const overlay = useNavigation((state) => state.overlay);
  const Overlay = overlay ? catalog.routes.get(overlay)?.component : undefined;
  const [shown, setShown] = useState(screen);
  const shownState = useRef<NavigationState>(store.getState());
  const settled = shown === screen;
  if (settled) {
    shownState.current = store.getState();
  }
  const client = useQueryClient();
  const fetching = useIsFetching();
  useEffect(() => {
    if (settled) {
      return;
    }
    if (fetching === 0 && client.isFetching() === 0) {
      setShown(screen);
      return;
    }
    const timer = setTimeout(() => setShown(screen), SWAP_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [client, fetching, screen, settled]);
  // The previous screen stays on view, frozen at its own route, until the next one has its data: no blank frame.
  const frozen = useMemo(() => (settled ? null : frozenStore(store, shownState.current)), [settled, store]);
  return (
    <div data-route-screen={screen} data-route-overlay={overlay ?? ""} className="relative h-full">
      {(frozen ? [shown, screen] : [screen]).map((id) => {
        const leaving = frozen !== null && id === shown;
        const entering = frozen !== null && id === screen;
        return (
          <div key={id} inert={frozen !== null} className={entering ? "invisible absolute inset-0" : "h-full"}>
            <NavigationContext.Provider value={leaving ? frozen : store}>
              <ScreenView id={id} />
            </NavigationContext.Provider>
          </div>
        );
      })}
      {overlay ? <Suspense fallback={null}>{Overlay ? <Overlay /> : <NotBuiltYet id={overlay} />}</Suspense> : null}
      <Notices />
    </div>
  );
}

function ScreenView({ id }: { id: ScreenId }): ReactNode {
  const Screen = catalog.routes.get(id)?.component;
  return <Suspense fallback={<LoadingState />}>{Screen ? <Screen /> : <NotBuiltYet id={id} />}</Suspense>;
}

// A copy of the navigation state that keeps the leaving screen's route; its actions still reach the real store.
function frozenStore(store: StoreApi<NavigationState>, state: NavigationState): StoreApi<NavigationState> {
  const live = store.getState();
  return createStore<NavigationState>()(() => ({
    ...state,
    overlay: null,
    go: live.go,
    close: live.close,
    back: live.back,
    returnTo: live.returnTo,
    reset: live.reset,
    replaceParams: live.replaceParams,
  }));
}
