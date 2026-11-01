import type { ValidationIssue } from "@icarus/contracts";
import { EngineUnavailable, type EngineUrl, engineUrl } from "./engine-url.ts";
import { isApiError, isValidationErrorBody } from "./response-checks.ts";

export { EngineUnavailable };

export class EngineRejected extends Error {
  constructor(
    message: string,
    readonly issues: ValidationIssue[],
  ) {
    super(issues[0]?.message ?? message);
    this.name = "EngineRejected";
  }
}

export class EngineError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

export class EngineResponseInvalid extends Error {
  constructor(path: string) {
    super(`The engine sent an answer the app cannot read for ${path}`);
    this.name = "EngineResponseInvalid";
  }
}

export type RequestOptions = { url?: EngineUrl; fetchFn?: typeof fetch };

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

// The only place that talks HTTP to the engine; every answer is checked before the app trusts it.
export async function request<T>(
  path: string,
  init: RequestInit,
  check: (body: unknown) => body is T,
  { url = engineUrl(), fetchFn = fetch }: RequestOptions = {},
): Promise<T> {
  const base = await url.current();
  let response: Response;
  try {
    response = await fetchFn(`${base}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init.headers },
    });
  } catch {
    throw new EngineUnavailable("The engine did not answer");
  }
  const body = await readJson(response);
  if (response.status === 422 && isValidationErrorBody(body)) {
    throw new EngineRejected(body.message, body.issues);
  }
  if (!response.ok) {
    if (isApiError(body)) {
      throw new EngineError(body.code, body.message);
    }
    throw new EngineResponseInvalid(path);
  }
  if (!check(body)) {
    throw new EngineResponseInvalid(path);
  }
  return body;
}
