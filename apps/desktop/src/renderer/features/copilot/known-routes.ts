import { useEffect, useState } from "react";
import type { RouteId } from "../../app/navigation/catalog-id.ts";

type KnownRoute = (id: RouteId) => boolean;

// The registry imports every catalog, the chat's among them, so it is loaded after this graph to avoid a cycle.
const registry = import("../../app/navigation/route-registry.ts").then(
  ({ catalog }): KnownRoute =>
    (id) =>
      catalog.routes.has(id),
);

let loaded: KnownRoute | null = null;
void registry.then((known) => {
  loaded = known;
});

const nothingYet: KnownRoute = () => false;

// Whether a screen, dialog or popover id is registered; nothing counts as known until the registry is in.
export function useKnownRoute(): KnownRoute {
  const [known, setKnown] = useState<KnownRoute>(() => loaded ?? nothingYet);
  useEffect(() => {
    let live = true;
    void registry.then((next) => {
      if (live) {
        setKnown(() => next);
      }
    });
    return () => {
      live = false;
    };
  }, []);
  return known;
}
