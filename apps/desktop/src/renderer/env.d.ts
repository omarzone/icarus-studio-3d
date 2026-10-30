import type { EngineBridge } from "../shared/engine-bridge.ts";
import type { WindowBridge } from "../shared/window-bridge.ts";
import type { RouteId } from "./app/navigation/catalog-id.ts";

declare global {
  interface Window {
    icarus: { engine: EngineBridge; window: WindowBridge };
    // Set by the design gallery and prototype for tests/design.
    __icarusCatalog?: {
      routes: { id: RouteId; maxDiff: number }[];
      modules: string[];
      open: (id: string) => boolean;
    };
  }
}
