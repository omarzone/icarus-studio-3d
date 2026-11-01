import { Suspense } from "react";
import { Notices } from "../../ui/notices.tsx";
import { LoadingState } from "../../ui/states.tsx";
import { useNavigation } from "./navigation-store.tsx";
import { NotBuiltYet } from "./not-built-yet.tsx";
import { catalog } from "./route-registry.ts";

export function Router() {
  const screen = useNavigation((state) => state.screen);
  const overlay = useNavigation((state) => state.overlay);
  const Screen = catalog.routes.get(screen)?.component;
  const Overlay = overlay ? catalog.routes.get(overlay)?.component : undefined;
  return (
    <div data-route-screen={screen} data-route-overlay={overlay ?? ""} className="relative h-full">
      <Suspense fallback={<LoadingState />}>{Screen ? <Screen /> : <NotBuiltYet id={screen} />}</Suspense>
      {overlay ? <Suspense fallback={null}>{Overlay ? <Overlay /> : <NotBuiltYet id={overlay} />}</Suspense> : null}
      <Notices />
    </div>
  );
}
