import type { EngineBridge, EngineStatus } from "../../shared/engine-bridge.ts";

export class EngineUnavailable extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "EngineUnavailable";
  }
}

export type EngineUrl = { current: () => Promise<string> };

// How long a request waits for an engine that is still starting (the first start syncs Python packages).
const START_WAIT_MS = 120_000;

// The engine's address, following restarts on a new port. Requests wait while it starts and fail while it is down.
export function createEngineUrl(bridge: EngineBridge, startWaitMs = START_WAIT_MS): EngineUrl {
  let latest: EngineStatus | undefined;
  const waiting = new Set<(status: EngineStatus) => void>();
  bridge.onStatus((status) => {
    latest = status;
    for (const notify of waiting) {
      notify(status);
    }
  });
  const settled = (status: EngineStatus): Promise<EngineStatus> =>
    status.kind !== "starting"
      ? Promise.resolve(status)
      : new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            waiting.delete(notify);
            reject(new EngineUnavailable("The engine is taking too long to start"));
          }, startWaitMs);
          const notify = (next: EngineStatus) => {
            if (next.kind !== "starting") {
              clearTimeout(timer);
              waiting.delete(notify);
              resolve(next);
            }
          };
          waiting.add(notify);
        });
  return {
    current: async () => {
      if (!latest) {
        // A status event may arrive while the first read is in flight; it is newer, so it wins.
        const first = await bridge.status();
        latest ??= first;
      }
      const status = await settled(latest);
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
