import type { EngineEvent } from "@icarus/contracts";
import { isEngineEventEnvelope } from "./engine-event-checks.ts";
import { type EngineUrl, engineUrl } from "./engine-url.ts";

// The part of the browser EventSource the engine events use; tests pass a fake class with the same shape.
export type EngineEventSourceLike = {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  close: () => void;
};

export type EngineEventSourceConstructor = new (url: string) => EngineEventSourceLike;

export type EngineEventHandlers = {
  onEvent: (event: EngineEvent) => void;
  // An event the app cannot read, or an engine that could not be reached; the subscription goes on.
  onError: (message: string) => void;
};

export type EngineEventsConnection = { close: () => void };

export type EngineEventsOptions = { url?: EngineUrl; source?: EngineEventSourceConstructor };

function readEvent(data: unknown): unknown {
  if (typeof data !== "string") {
    return undefined;
  }
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

// What happens in one project, as it happens: every event is checked before it is routed. A dropped stream
// reconnects by itself (EventSource); events missed meanwhile are caught up by the queries they invalidate.
export function openEngineEvents(
  project: string,
  handlers: EngineEventHandlers,
  options: EngineEventsOptions = {},
): EngineEventsConnection {
  const Source = options.source ?? EventSource;
  let source: EngineEventSourceLike | null = null;
  let closed = false;

  void (options.url ?? engineUrl()).current().then(
    (base) => {
      if (closed) {
        return;
      }
      const address = new URL("/events", base);
      address.searchParams.set("project", project);
      const created = new Source(address.toString());
      source = created;
      created.onmessage = (message) => {
        if (closed) {
          return;
        }
        const envelope = readEvent(message.data);
        if (isEngineEventEnvelope(envelope)) {
          handlers.onEvent(envelope.event);
        } else {
          handlers.onError("The engine sent an event the app cannot read");
        }
      };
    },
    (error: unknown) => {
      if (!closed) {
        handlers.onError(error instanceof Error ? error.message : "The engine could not be reached");
      }
    },
  );

  return {
    close: () => {
      closed = true;
      source?.close();
    },
  };
}
