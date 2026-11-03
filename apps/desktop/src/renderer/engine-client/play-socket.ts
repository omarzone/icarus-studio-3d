import type {
  PlayCommand,
  PlayCommandEnvelope,
  PlayEvent,
  PlayFrame,
  PlayProgressMessage,
  PlaySessionInfo,
} from "@icarus/contracts";
import { type EngineUrl, engineUrl } from "./engine-url.ts";
import { isPlayMessageEnvelope } from "./response-checks.ts";

// The part of the browser WebSocket that Play uses; tests pass a fake class with the same shape.
export type PlaySocketLike = {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  send: (data: string) => void;
  close: () => void;
};

export type PlaySocketConstructor = new (url: string) => PlaySocketLike;

export type PlayHandlers = {
  onReady: (session: PlaySessionInfo) => void;
  onFrame: (frame: PlayFrame) => void;
  onEvent: (event: PlayEvent) => void;
  // A command the engine refused, or a message the app cannot read; the session stays open.
  onError: (message: string) => void;
  // What the engine is doing before the session is ready.
  onProgress?: (stage: PlayProgressMessage["stage"]) => void;
  // The engine ended the session or could not be reached; not called after `close()`.
  onClosed: (reason: string) => void;
};

export type PlayConnection = { send: (command: PlayCommand) => void; close: () => void };

// The trained brain to play instead of the one the engine picks.
export type PlayBrainChoice = { runId: string; step: number };

export type PlayOptions = { url?: EngineUrl; socket?: PlaySocketConstructor; brain?: PlayBrainChoice };

export type OpenPlay = (projectId: string, handlers: PlayHandlers, options?: PlayOptions) => PlayConnection;

function playAddress(base: string, projectId: string, brain: PlayBrainChoice | undefined): string {
  const address = new URL(`/projects/${encodeURIComponent(projectId)}/play`, base);
  address.protocol = address.protocol === "https:" ? "wss:" : "ws:";
  if (brain) {
    address.searchParams.set("run", brain.runId);
    address.searchParams.set("step", String(brain.step));
  }
  return address.toString();
}

function readMessage(data: unknown): unknown {
  if (typeof data !== "string") {
    return undefined;
  }
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

// The Play WebSocket of one project: every message is checked before it is routed, commands wait for the socket.
export const openPlay: OpenPlay = (projectId, handlers, options = {}) => {
  const Socket = options.socket ?? WebSocket;
  let socket: PlaySocketLike | null = null;
  let open = false;
  let closed = false;
  const queue: string[] = [];

  const route = (data: unknown) => {
    const envelope = readMessage(data);
    if (!isPlayMessageEnvelope(envelope)) {
      handlers.onError("The engine sent a Play message the app cannot read");
      return;
    }
    const message = envelope.message;
    switch (message.type) {
      case "ready":
        handlers.onReady(message.session);
        return;
      case "frame":
        handlers.onFrame(message.frame);
        return;
      case "event":
        handlers.onEvent(message.event);
        return;
      case "error":
        handlers.onError(message.message);
        return;
      case "progress":
        handlers.onProgress?.(message.stage);
        return;
    }
  };

  void (options.url ?? engineUrl()).current().then(
    (base) => {
      if (closed) {
        return;
      }
      const created = new Socket(playAddress(base, projectId, options.brain));
      socket = created;
      created.onopen = () => {
        open = true;
        for (const text of queue.splice(0)) {
          created.send(text);
        }
      };
      created.onmessage = (event) => route(event.data);
      created.onclose = (event) => {
        open = false;
        if (!closed) {
          closed = true;
          handlers.onClosed(event.reason || "The Play session ended");
        }
      };
      // A failed socket also closes; the close reports it.
      created.onerror = () => undefined;
    },
    (error: unknown) => {
      if (!closed) {
        closed = true;
        handlers.onClosed(error instanceof Error ? error.message : "The engine could not be reached");
      }
    },
  );

  return {
    send: (command) => {
      if (closed) {
        return;
      }
      const envelope: PlayCommandEnvelope = { command };
      const text = JSON.stringify(envelope);
      if (open && socket) {
        socket.send(text);
      } else {
        queue.push(text);
      }
    },
    close: () => {
      closed = true;
      socket?.close();
    },
  };
};
