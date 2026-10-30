import type { EngineBridge } from "../shared/engine-bridge.ts";

declare global {
  interface Window {
    icarus: { engine: EngineBridge };
  }
}
