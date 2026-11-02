import { describe, expect, it, vi } from "vitest";
import { createEngineUrl } from "./engine-url.ts";
import { type EngineEventHandlers, type EngineEventSourceLike, openEngineEvents } from "./events-stream.ts";

class FakeSource implements EngineEventSourceLike {
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
}

const url = createEngineUrl({
  status: () => Promise.resolve({ kind: "ready", url: "http://127.0.0.1:9000", version: "0.1.0" }),
  onStatus: () => () => undefined,
  restart: () => Promise.resolve(),
});

const envelope = (event: unknown) => ({ id: "e1", project_id: "p 1", time: "2026-11-01T10:00:00Z", event });

function handlers() {
  return {
    onEvent: vi.fn<EngineEventHandlers["onEvent"]>(),
    onError: vi.fn<EngineEventHandlers["onError"]>(),
  };
}

async function open(spy: EngineEventHandlers) {
  const connection = openEngineEvents("p 1", spy, { url, source: FakeSource });
  await vi.waitFor(() => expect(FakeSource.last).toBeDefined());
  const source = FakeSource.last;
  if (!source) {
    throw new Error("no source");
  }
  return { connection, source };
}

describe("openEngineEvents", () => {
  it("subscribes to the project's events and routes the ones it can read", async () => {
    FakeSource.last = undefined;
    const spy = handlers();
    const { source } = await open(spy);
    expect(source.url).toBe("http://127.0.0.1:9000/events?project=p+1");
    source.receive(envelope({ type: "step", turn_id: "t1", step: { tool: "inspect", summary: "Read the world" } }));
    source.receive(envelope({ type: "task_progress", task_id: "k1", progress: 0.5, text: "Half way" }));
    source.receive(
      envelope({
        type: "task_started",
        task: {
          id: "k1",
          project_id: "p 1",
          kind: "training_run",
          state: "running",
          title: "Run 3",
          started_at: "2026-11-01T10:00:00Z",
        },
      }),
    );
    expect(spy.onEvent.mock.calls.map(([event]) => event.type)).toEqual(["step", "task_progress", "task_started"]);
    expect(spy.onError).not.toHaveBeenCalled();
  });

  it("reports events it cannot read and keeps listening", async () => {
    FakeSource.last = undefined;
    const spy = handlers();
    const { source } = await open(spy);
    source.receive("not json");
    source.receive(envelope({ type: "step", turn_id: "t1", step: { tool: "fly", summary: "?" } }));
    source.receive(envelope({ type: "something_new" }));
    source.receive(envelope({ type: "revision_created", revision: 4, author: "copilot", summary: "Taller walls" }));
    expect(spy.onError).toHaveBeenCalledTimes(3);
    expect(spy.onEvent).toHaveBeenCalledTimes(1);
  });

  it("stops routing once closed", async () => {
    FakeSource.last = undefined;
    const spy = handlers();
    const { connection, source } = await open(spy);
    connection.close();
    source.receive(envelope({ type: "diagnosis_created", diagnosis_id: "d1", run_id: "r1" }));
    expect(source.closed).toBe(true);
    expect(spy.onEvent).not.toHaveBeenCalled();
  });
});
