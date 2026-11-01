import type { RunStatus } from "@icarus/contracts";
import { describe, expect, it, vi } from "vitest";
import { createEngineUrl } from "./engine-url.ts";
import { openRunEvents, type RunEventHandlers, type RunEventSourceLike } from "./run-events.ts";

class FakeSource implements RunEventSourceLike {
  static last: FakeSource | undefined;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeSource.last = this;
  }
  close() {
    this.closed = true;
  }
  receive(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data: typeof data === "string" ? data : JSON.stringify(data) }));
  }
  fail() {
    this.onerror?.(new Event("error"));
  }
}

const url = createEngineUrl({
  status: () => Promise.resolve({ kind: "ready", url: "http://127.0.0.1:9000", version: "0.1.0" }),
  onStatus: () => () => undefined,
  restart: () => Promise.resolve(),
});

const status = (state: RunStatus["state"]): RunStatus => ({
  run_id: "run-1",
  project_id: "p",
  revision_number: 2,
  name: "Run 1",
  state,
  step: 25_000,
  total_steps: 1_000_000,
  copies: 16,
  steps_per_second: 1840,
  started_at: "2026-11-01T10:00:00Z",
});

function handlers() {
  return {
    onStatus: vi.fn<RunEventHandlers["onStatus"]>(),
    onMetric: vi.fn<RunEventHandlers["onMetric"]>(),
    onCheckpoint: vi.fn<RunEventHandlers["onCheckpoint"]>(),
    onSnapshot: vi.fn<RunEventHandlers["onSnapshot"]>(),
    onLog: vi.fn<RunEventHandlers["onLog"]>(),
    onError: vi.fn<RunEventHandlers["onError"]>(),
    onEnd: vi.fn<RunEventHandlers["onEnd"]>(),
    onClosed: vi.fn<RunEventHandlers["onClosed"]>(),
  };
}

async function connected() {
  const calls = handlers();
  FakeSource.last = undefined;
  const connection = openRunEvents("run 1", calls, { url, source: FakeSource });
  const latest = (): FakeSource | undefined => FakeSource.last;
  await vi.waitFor(() => expect(latest()).toBeDefined());
  const source = latest();
  if (!source) {
    throw new Error("no source");
  }
  return { calls, connection, source };
}

describe("openRunEvents", () => {
  it("listens to the run's events on the engine's address", async () => {
    const { source } = await connected();
    expect(source.url).toBe("http://127.0.0.1:9000/runs/run%201/events");
  });

  it("routes every kind of run event", async () => {
    const { calls, source } = await connected();
    const metric = {
      kind: "train",
      step: 16_384,
      elapsed: 9,
      episode_return: 3.5,
      episode_length: 200,
      reward_terms: {},
    };
    const checkpoint = { step: 0, episode_return: -1, has_rollout: true };
    const snapshot = {
      step: 16_384,
      geoms: ["chassis"],
      copies: [{ positions: [[0, 0, 0.2]], quaternions: [[1, 0, 0, 0]] }],
    };
    const line = { elapsed: 1.5, level: "info", text: "Run 1 started" };
    source.receive({ event: { type: "status", status: status("running") } });
    source.receive({ event: { type: "metric", metric } });
    source.receive({ event: { type: "checkpoint", checkpoint } });
    source.receive({ event: { type: "snapshot", snapshot } });
    source.receive({ event: { type: "log", line } });
    expect(calls.onStatus).toHaveBeenCalledWith(status("running"));
    expect(calls.onMetric).toHaveBeenCalledWith(metric);
    expect(calls.onCheckpoint).toHaveBeenCalledWith(checkpoint);
    expect(calls.onSnapshot).toHaveBeenCalledWith(snapshot);
    expect(calls.onLog).toHaveBeenCalledWith(line);
    expect(calls.onError).not.toHaveBeenCalled();
  });

  it("reports an unreadable event instead of throwing", async () => {
    const { calls, source } = await connected();
    expect(() => source.receive("not json")).not.toThrow();
    source.receive({ event: { type: "snapshot", snapshot: { step: "soon" } } });
    source.receive({ event: { type: "applause" } });
    expect(calls.onError).toHaveBeenCalledTimes(3);
    expect(calls.onSnapshot).not.toHaveBeenCalled();
  });

  it("ends after a final status and closes the source so it does not reconnect", async () => {
    const { calls, source } = await connected();
    source.receive({ event: { type: "status", status: status("stopping") } });
    expect(calls.onEnd).not.toHaveBeenCalled();
    source.receive({ event: { type: "status", status: status("stopped") } });
    expect(calls.onEnd).toHaveBeenCalledTimes(1);
    expect(source.closed).toBe(true);
    source.fail();
    expect(calls.onClosed).not.toHaveBeenCalled();
  });

  it("tells when the stream is lost before the run ends, but not when the app closes it", async () => {
    const first = await connected();
    first.source.fail();
    expect(first.source.closed).toBe(true);
    expect(first.calls.onClosed).toHaveBeenCalledWith("The connection to the run was lost");

    const second = await connected();
    second.connection.close();
    second.source.fail();
    expect(second.source.closed).toBe(true);
    expect(second.calls.onClosed).not.toHaveBeenCalled();
  });

  it("tells when the engine cannot be reached", async () => {
    const calls = handlers();
    const down = createEngineUrl({
      status: () => Promise.resolve({ kind: "down", reason: "crashed", lastLog: [] }),
      onStatus: () => () => undefined,
      restart: () => Promise.resolve(),
    });
    openRunEvents("run-1", calls, { url: down, source: FakeSource });
    await vi.waitFor(() => expect(calls.onClosed).toHaveBeenCalledWith("The engine is not running: crashed"));
  });
});
