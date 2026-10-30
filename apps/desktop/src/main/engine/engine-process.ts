import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";

export function engineCommand(repoRoot: string, port: number): { command: string; args: string[] } {
  const project = join(repoRoot, "services", "engine").replaceAll("\\", "/");
  return {
    command: "uv",
    args: ["run", "--project", project, "icarus-engine", "--port", String(port), "--exit-with-stdin"],
  };
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address ? resolve(address.port) : reject(new Error("no port")),
      );
    });
  });
}

export function spawnEngine(repoRoot: string, port: number, onLine: (line: string) => void): ChildProcess {
  const { command, args } = engineCommand(repoRoot, port);
  const child = spawn(command, args, { cwd: repoRoot, windowsHide: true, detached: process.platform !== "win32" });
  for (const stream of [child.stdout, child.stderr]) {
    stream?.setEncoding("utf8");
    stream?.on("data", (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (line.trim()) {
          onLine(line);
        }
      }
    });
  }
  return child;
}

// Synchronous so the engine tree is gone before the app process exits.
function killSync(cmd: string, args: string[]): void {
  try {
    execFileSync(cmd, args, { stdio: "ignore", windowsHide: true });
  } catch {
    // Already gone.
  }
}

export function stopEngine(
  pid: number,
  platform: NodeJS.Platform,
  run: (cmd: string, args: string[]) => void = killSync,
): void {
  if (platform === "win32") {
    run("taskkill", ["/PID", String(pid), "/T", "/F"]);
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    // Already gone.
  }
}
