import { createContext, type ReactNode, useContext, useState } from "react";
import { createStore, type StoreApi, useStore } from "zustand";
import { isOverlay, type OverlayId, type RouteId, type ScreenId } from "./catalog-id.ts";

export type RouteParams = Readonly<Record<string, string>>;

export type NavigationLocation = {
  screen: ScreenId;
  overlay: OverlayId | null;
  params: RouteParams;
};

export type NavigationState = NavigationLocation & {
  history: NavigationLocation[];
  go: (id: RouteId, params?: RouteParams) => void;
  close: () => void;
  back: () => void;
  reset: (location: NavigationLocation) => void;
};

export function createNavigationStore(initial: NavigationLocation): StoreApi<NavigationState> {
  return createStore<NavigationState>()((set) => ({
    ...initial,
    history: [],
    go: (id, params) =>
      set((state) => {
        const nextParams = params ?? state.params;
        if (isOverlay(id)) {
          return { overlay: id, params: nextParams };
        }
        const current = { screen: state.screen, overlay: null, params: state.params };
        return { screen: id, overlay: null, params: nextParams, history: [...state.history, current] };
      }),
    close: () => set({ overlay: null }),
    back: () =>
      set((state) => {
        const previous = state.history.at(-1);
        return previous ? { ...previous, history: state.history.slice(0, -1) } : { overlay: null };
      }),
    reset: (location) => set({ ...location, history: [] }),
  }));
}

const NavigationContext = createContext<StoreApi<NavigationState> | null>(null);

export function NavigationProvider({ initial, children }: { initial: NavigationLocation; children: ReactNode }) {
  const [store] = useState(() => createNavigationStore(initial));
  return <NavigationContext.Provider value={store}>{children}</NavigationContext.Provider>;
}

export function useNavigationStore(): StoreApi<NavigationState> {
  const store = useContext(NavigationContext);
  if (!store) {
    throw new Error("useNavigation needs a NavigationProvider above it");
  }
  return store;
}

export function useNavigation<T>(select: (state: NavigationState) => T): T {
  return useStore(useNavigationStore(), select);
}
