import type { EngineBridge } from "../shared/engine-bridge.ts";
import type { WindowBridge } from "../shared/window-bridge.ts";

declare global {
  interface Window {
    icarus: { engine: EngineBridge; window: WindowBridge };
  }
}
