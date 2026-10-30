import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { EngineStartError } from "./health.ts";
import { EngineSupervisor, type SupervisorDeps } from "./supervisor.ts";

class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  constructor(readonly pid: number) {
    super();
  }
  exit(code: number): void {
    this.exitCode = code;
    this.emit("exit", code);
  }
}

function harness() {
  const children: FakeChild[] = [];
  const waits: Array<{ resolve: () => void; reject: (e: Error) => void; signal: AbortSignal | undefined }> = [];
  const kill = vi.fn();
  const deps: SupervisorDeps = {
    freePort: async () => 9000 + children.length,
    spawn: () => {
      const child = new FakeChild(100 + children.length);
      children.push(child);
      // SAFETY: the fake implements the parts of ChildProcess the supervisor uses (pid, exitCode, events).
      return child as never;
    },
    waitForHealth: (_url, { signal }) =>
      new Promise((resolve, reject) => {
        const wait = { resolve: () => resolve({ status: "ok", version: "0.1.0", api_version: 1 }), reject, signal };
        signal?.addEventListener("abort", () => reject(new EngineStartError("exited", "aborted")));
        waits.push(wait);
      }),
    kill,
  };
  return { children, waits, kill, supervisor: new EngineSupervisor("/repo", undefined, deps) };
}

it("an old start attempt never kills the engine a restart brought back", async () => {
  const { children, waits, kill, supervisor } = harness();
  const first = supervisor.start();
  await vi.waitFor(() => expect(children).toHaveLength(1));
  children[0]?.exit(1);
  expect(supervisor.status.kind).toBe("down");
  const second = supervisor.restart();
  await vi.waitFor(() => expect(waits).toHaveLength(2));
  waits[1]?.resolve();
  await second;
  waits[0]?.reject(new EngineStartError("timeout", "late"));
  await first;
  expect(supervisor.status.kind).toBe("ready");
  expect(kill).not.toHaveBeenCalledWith(101);
});

it("goes down at once with the reason when the engine cannot be spawned", async () => {
  const { children, supervisor } = harness();
  const started = supervisor.start();
  await vi.waitFor(() => expect(children).toHaveLength(1));
  children[0]?.emit("error", Object.assign(new Error("spawn uv ENOENT"), { code: "ENOENT" }));
  await started;
  expect(supervisor.status).toMatchObject({ kind: "down", reason: "uv was not found on PATH" });
});
