import type { ChildProcess } from "node:child_process";
import type { EngineStatus } from "../../shared/engine-bridge.ts";
import { freePort, spawnEngine, stopEngine } from "./engine-process.ts";
import { type EngineEvent, nextStatus } from "./engine-status.ts";
import { waitForHealth } from "./health.ts";

const START_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 250;
const LOG_LINES = 50;

export class EngineSupervisor {
  private current: EngineStatus = { kind: "starting" };
  private child: ChildProcess | null = null;
  private readonly log: string[] = [];
  private readonly listeners = new Set<(status: EngineStatus) => void>();

  constructor(
    private readonly repoRoot: string,
    private readonly externalUrl: string | undefined,
  ) {}

  get status(): EngineStatus {
    return this.current;
  }

  onChange(listener: (status: EngineStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    const url = this.externalUrl ?? (await this.spawn());
    try {
      const health = await waitForHealth(url, { timeoutMs: START_TIMEOUT_MS, intervalMs: POLL_INTERVAL_MS });
      this.apply({ type: "healthy", url, version: health.version });
    } catch {
      this.apply({ type: "timeout", lastLog: [...this.log] });
      this.stop();
    }
  }

  async restart(): Promise<void> {
    this.stop();
    this.apply({ type: "restart" });
    await this.start();
  }

  stop(): void {
    const child = this.child;
    this.child = null;
    if (child?.pid !== undefined && child.exitCode === null) {
      stopEngine(child.pid, process.platform);
    }
  }

  private async spawn(): Promise<string> {
    const port = await freePort();
    const child = spawnEngine(this.repoRoot, port, (line) => {
      this.log.push(line);
      this.log.splice(0, Math.max(0, this.log.length - LOG_LINES));
    });
    child.on("exit", (code) => {
      if (this.child === child) {
        this.child = null;
        this.apply({ type: "exited", code, lastLog: [...this.log] });
      }
    });
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
