import type { HealthStatus } from "@icarus/contracts";

export class EngineStartError extends Error {
  constructor(
    readonly reason: "timeout" | "exited",
    message: string,
  ) {
    super(message);
  }
}

type Options = { timeoutMs: number; intervalMs: number; fetchFn?: typeof fetch };

export async function waitForHealth(
  url: string,
  { timeoutMs, intervalMs, fetchFn = fetch }: Options,
): Promise<HealthStatus> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetchFn(`${url}/health`);
      if (response.ok) {
        const body: HealthStatus = await response.json();
        return body;
      }
    } catch {
      // The engine is not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new EngineStartError("timeout", `The engine did not answer ${url}/health within ${timeoutMs} ms`);
}
