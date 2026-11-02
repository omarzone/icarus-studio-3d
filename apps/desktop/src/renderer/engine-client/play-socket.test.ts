import { describe, expect, it, vi } from "vitest";
import play from "../ports/testdata/play-frame.json";
import { createEngineUrl } from "./engine-url.ts";
import { openPlay, type PlayHandlers, type PlaySocketLike } from "./play-socket.ts";

class FakeSocket implements PlaySocketLike {
  static last: FakeSocket | undefined;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly sent: string[] = [];
  closed = false;

  constructor(readonly url: string) {
    FakeSocket.last = this;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.(new Event("open"));
  }
  receive(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data: typeof data === "string" ? data : JSON.stringify(data) }));
  }
  drop(code: number, reason: string) {
    this.onclose?.(new CloseEvent("close", { code, reason }));
  }
}

const url = createEngineUrl({
  status: () => Promise.resolve({ kind: "ready", url: "http://127.0.0.1:9000", version: "0.1.0" }),
  onStatus: () => () => undefined,
  restart: () => Promise.resolve(),
});

function handlers() {
  return {
    onReady: vi.fn<PlayHandlers["onReady"]>(),
    onFrame: vi.fn<PlayHandlers["onFrame"]>(),
    onEvent: vi.fn<PlayHandlers["onEvent"]>(),
    onError: vi.fn<PlayHandlers["onError"]>(),
    onClosed: vi.fn<PlayHandlers["onClosed"]>(),
  };
}

async function connected() {
  const calls = handlers();
  FakeSocket.last = undefined;
  const connection = openPlay("my project", calls, { url, socket: FakeSocket });
  const latest = (): FakeSocket | undefined => FakeSocket.last;
  await vi.waitFor(() => expect(latest()).toBeDefined());
  const socket = latest();
  if (!socket) {
    throw new Error("no socket");
  }
  return { calls, connection, socket };
}

describe("openPlay", () => {
  it("opens the project's Play socket on the engine's address", async () => {
    const { socket } = await connected();
    expect(socket.url).toBe("ws://127.0.0.1:9000/projects/my%20project/play");
  });

  it("asks for a chosen brain by its run and checkpoint", async () => {
    FakeSocket.last = undefined;
    openPlay("p", handlers(), { url, socket: FakeSocket, brain: { runId: "run-1", step: 25000 } });
    const latest = (): FakeSocket | undefined => FakeSocket.last;
    await vi.waitFor(() => expect(latest()).toBeDefined());
    expect(latest()?.url).toBe("ws://127.0.0.1:9000/projects/p/play?run=run-1&step=25000");
  });

  it("routes ready, frame and event messages", async () => {
    const { calls, socket } = await connected();
    socket.receive(play.ready);
    socket.receive(play.frame);
    socket.receive(play.event);
    expect(calls.onReady).toHaveBeenCalledWith(expect.objectContaining({ brain: "Untrained brain: random actions" }));
    expect(calls.onFrame).toHaveBeenCalledWith(
      expect.objectContaining({ status: { title: "Playing", detail: "12.0 m to the parking spot" } }),
    );
    expect(calls.onEvent).toHaveBeenCalledWith(expect.objectContaining({ text: "You pushed Car with 10 N·s" }));
    expect(calls.onError).not.toHaveBeenCalled();
  });

  it("reports an engine error message without closing", async () => {
    const { calls, socket } = await connected();
    socket.receive(play.error);
    expect(calls.onError).toHaveBeenCalledWith("There is no object 'no_such_object' in this world");
    expect(socket.closed).toBe(false);
  });

  it("reports a malformed message instead of throwing", async () => {
    const { calls, socket } = await connected();
    expect(() => socket.receive("not json")).not.toThrow();
    socket.receive({ message: { type: "frame", frame: { time: "soon" } } });
    expect(calls.onError).toHaveBeenCalledTimes(2);
    expect(calls.onFrame).not.toHaveBeenCalled();
  });

  it("passes a frame's distance sensors through and reports malformed ones", async () => {
    const { calls, socket } = await connected();
    const ray = { sensor: "car:ray0", label: "Car distance 1", origin: [0, 0, 0.5], direction: [1, 0, 0], range: 10 };
    const withRays = (rays: unknown) => ({
      message: { ...play.frame.message, frame: { ...play.frame.message.frame, rays } },
    });
    socket.receive(withRays([{ ...ray, distance: null }]));
    socket.receive(withRays([{ ...ray, distance: "near" }]));
    expect(calls.onFrame).toHaveBeenCalledTimes(1);
    expect(calls.onError).toHaveBeenCalledTimes(1);
  });

  it("sends a command as an envelope, waiting for the socket to open", async () => {
    const { connection, socket } = await connected();
    connection.send({ tool: "reset" });
    expect(socket.sent).toEqual([]);
    socket.open();
    connection.send({ tool: "pause", paused: true });
    expect(socket.sent.map((text) => JSON.parse(text))).toEqual([
      { command: { tool: "reset" } },
      { command: { tool: "pause", paused: true } },
    ]);
  });

  it("tells when the engine closes the session, but not when the app does", async () => {
    const first = await connected();
    first.socket.drop(4404, "No project with that id");
    expect(first.calls.onClosed).toHaveBeenCalledWith("No project with that id");

    const second = await connected();
    second.connection.close();
    second.socket.drop(1000, "");
    expect(second.socket.closed).toBe(true);
    expect(second.calls.onClosed).not.toHaveBeenCalled();
  });

  it("tells when the engine cannot be reached", async () => {
    const calls = handlers();
    const down = createEngineUrl({
      status: () => Promise.resolve({ kind: "down", reason: "crashed", lastLog: [] }),
      onStatus: () => () => undefined,
      restart: () => Promise.resolve(),
    });
    openPlay("p", calls, { url: down, socket: FakeSocket });
    await vi.waitFor(() => expect(calls.onClosed).toHaveBeenCalledWith("The engine is not running: crashed"));
  });
});
