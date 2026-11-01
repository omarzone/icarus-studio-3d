import type { EngineBridge, EngineStatus } from "../../shared/engine-bridge.ts";

export class EngineUnavailable extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "EngineUnavailable";
  }
}

export type EngineUrl = { current: () => Promise<string> };

// The engine's address, following restarts on a new port.
export function createEngineUrl(bridge: EngineBridge): EngineUrl {
  let latest: EngineStatus | undefined;
  bridge.onStatus((status) => {
    latest = status;
  });
  return {
    current: async () => {
      const status = latest ?? (await bridge.status());
      latest ??= status;
      switch (status.kind) {
        case "ready":
          return status.url;
        case "starting":
          throw new EngineUnavailable("The engine is still starting");
        case "down":
          throw new EngineUnavailable(`The engine is not running: ${status.reason}`);
      }
    },
  };
}

let shared: EngineUrl | undefined;

export function engineUrl(): EngineUrl {
  shared ??= createEngineUrl(window.icarus.engine);
  return shared;
}
