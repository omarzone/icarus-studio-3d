import type { CheckpointInfo, LogLine, MetricPoint, RunStatus, TrainingSnapshot } from "@icarus/contracts";
import { type EngineUrl, engineUrl } from "./engine-url.ts";
import { isRunEventEnvelope } from "./training-checks.ts";

// The part of the browser EventSource that run events use; tests pass a fake class with the same shape.
export type RunEventSourceLike = {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  close: () => void;
};

export type RunEventSourceConstructor = new (url: string) => RunEventSourceLike;

export type RunEventHandlers = {
  onStatus: (status: RunStatus) => void;
  onMetric: (metric: MetricPoint) => void;
  onCheckpoint: (checkpoint: CheckpointInfo) => void;
  onSnapshot: (snapshot: TrainingSnapshot) => void;
  onLog: (line: LogLine) => void;
  // An event the app cannot read; the stream goes on.
  onError: (message: string) => void;
  // The run reached a final state; the stream is over.
  onEnd: () => void;
  // The stream was lost or the engine could not be reached before the run ended; not called after `close()`.
  onClosed: (reason: string) => void;
};

export type RunEventsConnection = { close: () => void };

export type RunEventsOptions = { url?: EngineUrl; source?: RunEventSourceConstructor };

export type OpenRunEvents = (
  runId: string,
  handlers: RunEventHandlers,
  options?: RunEventsOptions,
) => RunEventsConnection;

const FINAL_STATES: readonly RunStatus["state"][] = ["done", "stopped", "failed"];

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

// The server-sent events of one run: every event is checked before it is routed; the stream ends after a final status.
export const openRunEvents: OpenRunEvents = (runId, handlers, options = {}) => {
  const Source = options.source ?? EventSource;
  let source: RunEventSourceLike | null = null;
  let closed = false;
  const finish = () => {
    closed = true;
    source?.close();
  };

  const route = (data: unknown) => {
    const envelope = readEvent(data);
    if (!isRunEventEnvelope(envelope)) {
      handlers.onError("The engine sent a run event the app cannot read");
      return;
    }
    const event = envelope.event;
    switch (event.type) {
      case "status":
        handlers.onStatus(event.status);
        if (FINAL_STATES.includes(event.status.state)) {
          finish();
          handlers.onEnd();
        }
        return;
      case "metric":
        handlers.onMetric(event.metric);
        return;
      case "checkpoint":
        handlers.onCheckpoint(event.checkpoint);
        return;
      case "snapshot":
        handlers.onSnapshot(event.snapshot);
        return;
      case "log":
        handlers.onLog(event.line);
        return;
    }
  };

  void (options.url ?? engineUrl()).current().then(
    (base) => {
      if (closed) {
        return;
      }
      const created = new Source(new URL(`/runs/${encodeURIComponent(runId)}/events`, base).toString());
      source = created;
      created.onmessage = (event) => {
        if (!closed) {
          route(event.data);
        }
      };
      // EventSource reconnects by itself and would replay the stream, so a lost stream is closed and reported.
      created.onerror = () => {
        if (!closed) {
          finish();
          handlers.onClosed("The connection to the run was lost");
        }
      };
    },
    (error: unknown) => {
      if (!closed) {
        closed = true;
        handlers.onClosed(error instanceof Error ? error.message : "The engine could not be reached");
      }
    },
  );

  return { close: finish };
};
