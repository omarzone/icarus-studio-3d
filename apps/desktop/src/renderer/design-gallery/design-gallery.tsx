import { useEffect } from "react";
import { AppProviders, HOME } from "../app/app-providers.tsx";
import { isOverlay } from "../app/navigation/catalog-id.ts";
import { type NavigationLocation, useNavigationStore } from "../app/navigation/navigation-store.tsx";
import { catalog } from "../app/navigation/route-registry.ts";
import { Router } from "../app/navigation/router.tsx";

export const GALLERY_PREFIX = "#/__design/";
export const PROTOTYPE_PREFIX = "#/__prototype/";

export function galleryEnabled(): boolean {
  return import.meta.env.DEV || new URLSearchParams(location.search).get("gallery") === "1";
}

export function locationOf(id: string): NavigationLocation | null {
  const entry = [...catalog.routes.values()].find((route) => route.id === id);
  if (!entry) {
    return null;
  }
  if (isOverlay(entry.id)) {
    return entry.over ? { screen: entry.over, overlay: entry.id, params: {} } : null;
  }
  return { screen: entry.id, overlay: null, params: {} };
}

// Exposes the catalog and a reset to the design checks in tests/design.
function TestHooks() {
  const store = useNavigationStore();
  useEffect(() => {
    window.__icarusCatalog = {
      routes: [...catalog.routes.values()].map(({ id, maxDiff }) => ({ id, maxDiff })),
      modules: [...catalog.modules.keys()],
      open: (id) => {
        const target = locationOf(id);
        if (target) {
          store.getState().reset(target);
        }
        return target !== null;
      },
    };
  }, [store]);
  return null;
}

// One catalog ID at the 1440×900 reference size, with fixture data. Development only.
export function DesignGallery({ id }: { id: string }) {
  const module = [...catalog.modules.values()].find((entry) => entry.id === id);
  const target = locationOf(id);
  return (
    <div data-design-root className="relative h-[900px] w-[1440px] overflow-hidden bg-app text-fg">
      <AppProviders mode="prototype" initial={target ?? HOME}>
        <TestHooks />
        {module ? (
          <module.component />
        ) : target ? (
          <Router />
        ) : (
          <p className="p-4 text-body">No gallery entry for {id}</p>
        )}
      </AppProviders>
    </div>
  );
}

// The whole app on fixture data, starting at any catalog ID, so every flow can be clicked through.
export function Prototype({ start }: { start: string }) {
  const target = locationOf(start);
  return (
    <AppProviders mode="prototype" initial={target ?? HOME}>
      <TestHooks />
      <Router />
    </AppProviders>
  );
}
