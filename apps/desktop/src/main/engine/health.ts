import type { HealthStatus } from "@icarus/contracts";

export const API_VERSION = 1;

export class EngineStartError extends Error {
  constructor(
    readonly reason: "timeout" | "exited" | "incompatible",
    message: string,
  ) {
    super(message);
  }
}

type Options = { timeoutMs: number; intervalMs: number; fetchFn?: typeof fetch; signal?: AbortSignal };

function parseHealth(body: unknown): HealthStatus | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const { status, version, api_version } = body as Record<string, unknown>;
  if (status !== "ok" || typeof version !== "string" || api_version !== API_VERSION) {
    return null;
  }
  return { status, version, api_version };
}

function aborted(signal: AbortSignal | undefined): EngineStartError | null {
  return signal?.aborted ? new EngineStartError("exited", "The engine stopped before it was ready") : null;
}

export async function waitForHealth(
  url: string,
  { timeoutMs, intervalMs, fetchFn = fetch, signal }: Options,
): Promise<HealthStatus> {
  const deadline = Date.now() + timeoutMs;
  const requestTimeout = Math.max(intervalMs * 8, 1000);
  while (Date.now() < deadline) {
    const stop = aborted(signal);
    if (stop) {
      throw stop;
    }
    try {
      const response = await fetchFn(`${url}/health`, {
        signal: AbortSignal.timeout(Math.min(requestTimeout, timeoutMs)),
      });
      if (response.ok) {
        const health = parseHealth(await response.json());
        if (!health) {
          throw new EngineStartError("incompatible", `Another program is answering on ${url}`);
        }
        return health;
      }
    } catch (error) {
      if (error instanceof EngineStartError) {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw (
    aborted(signal) ?? new EngineStartError("timeout", `The engine did not answer ${url}/health within ${timeoutMs} ms`)
  );
}
