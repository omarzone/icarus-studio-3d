import type { ChildProcess } from "node:child_process";
import type { EngineStatus } from "../../shared/engine-bridge.ts";
import { freePort, spawnEngine, stopEngine } from "./engine-process.ts";
import { type EngineEvent, nextStatus } from "./engine-status.ts";
import { EngineStartError, waitForHealth } from "./health.ts";

const START_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 250;
const LOG_LINES = 50;

export type SupervisorDeps = {
  freePort: () => Promise<number>;
  spawn: (repoRoot: string, port: number, onLine: (line: string) => void) => ChildProcess;
  waitForHealth: typeof waitForHealth;
  kill: (pid: number) => void;
};

const realDeps: SupervisorDeps = {
  freePort,
  spawn: spawnEngine,
  waitForHealth,
  kill: (pid) => stopEngine(pid, process.platform),
};

function spawnFailure(error: NodeJS.ErrnoException): string {
  return error.code === "ENOENT" ? "uv was not found on PATH" : `The engine could not start: ${error.message}`;
}

export class EngineSupervisor {
  private current: EngineStatus = { kind: "starting" };
  private child: ChildProcess | null = null;
  private attempt = 0;
  private abort: AbortController | null = null;
  private readonly log: string[] = [];
  private readonly listeners = new Set<(status: EngineStatus) => void>();

  constructor(
    private readonly repoRoot: string,
    private readonly externalUrl: string | undefined,
    private readonly deps: SupervisorDeps = realDeps,
  ) {}

  get status(): EngineStatus {
    return this.current;
  }

  onChange(listener: (status: EngineStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    const attempt = ++this.attempt;
    const abort = new AbortController();
    this.abort = abort;
    const url = this.externalUrl ?? (await this.spawn(attempt, abort));
    try {
      const health = await this.deps.waitForHealth(url, {
        timeoutMs: START_TIMEOUT_MS,
        intervalMs: POLL_INTERVAL_MS,
        signal: abort.signal,
      });
      if (attempt === this.attempt) {
        this.apply({ type: "healthy", url, version: health.version });
      }
    } catch (error) {
      if (attempt !== this.attempt || (error instanceof EngineStartError && error.reason === "exited")) {
        return;
      }
      const lastLog = [...this.log];
      this.apply(
        error instanceof EngineStartError && error.reason === "incompatible"
          ? { type: "failed", reason: error.message, lastLog }
          : { type: "timeout", lastLog },
      );
      this.stop();
    }
  }

  async restart(): Promise<void> {
    this.stop();
    this.apply({ type: "restart" });
    await this.start();
  }

  stop(): void {
    this.abort?.abort();
    const child = this.child;
    this.child = null;
    if (child?.pid !== undefined && child.exitCode === null) {
      this.deps.kill(child.pid);
    }
  }

  private async spawn(attempt: number, abort: AbortController): Promise<string> {
    const port = await this.deps.freePort();
    const child = this.deps.spawn(this.repoRoot, port, (line) => {
      this.log.push(line);
      this.log.splice(0, Math.max(0, this.log.length - LOG_LINES));
    });
    const settle = (event: EngineEvent) => {
      abort.abort();
      if (this.child === child && attempt === this.attempt) {
        this.child = null;
        this.apply(event);
      }
    };
    child.on("error", (error: NodeJS.ErrnoException) =>
      settle({ type: "failed", reason: spawnFailure(error), lastLog: [...this.log] }),
    );
    child.on("exit", (code) => settle({ type: "exited", code, lastLog: [...this.log] }));
    this.child = child;
    return `http://127.0.0.1:${port}`;
  }

  private apply(event: EngineEvent): void {
    this.current = nextStatus(this.current, event);
    console.log(`[engine] ${this.current.kind}${this.current.kind === "down" ? `: ${this.current.reason}` : ""}`);
    for (const listener of this.listeners) {
      listener(this.current);
    }
  }
}
