import type { ComponentType } from "react";
import type { ModuleId, RouteId, ScreenId } from "./catalog-id.ts";

export type RouteEntry = {
  id: RouteId;
  component: ComponentType;
  // Screen drawn underneath when an overlay is opened on its own (gallery, prototype start).
  over?: ScreenId;
  // Largest share of differing pixels allowed against docs/design/reference/<id>.png.
  maxDiff: number;
};

export type ModuleEntry = { id: ModuleId; component: ComponentType };

// Every feature folder exports one `catalog` from a `catalog.tsx` file; the app collects them here.
export type Catalog = { routes?: readonly RouteEntry[]; modules?: readonly ModuleEntry[] };

export function collectCatalogs(modules: Record<string, { catalog: Catalog }>): {
  routes: Map<RouteId, RouteEntry>;
  modules: Map<ModuleId, ModuleEntry>;
} {
  const routes = new Map<RouteId, RouteEntry>();
  const moduleEntries = new Map<ModuleId, ModuleEntry>();
  for (const [file, { catalog }] of Object.entries(modules)) {
    for (const route of catalog.routes ?? []) {
      if (routes.has(route.id)) {
        throw new Error(`${route.id} is registered twice (again in ${file})`);
      }
      routes.set(route.id, route);
    }
    for (const entry of catalog.modules ?? []) {
      moduleEntries.set(entry.id, entry);
    }
  }
  return { routes, modules: moduleEntries };
}

export const catalog = collectCatalogs(import.meta.glob<{ catalog: Catalog }>("../../**/catalog.tsx", { eager: true }));
