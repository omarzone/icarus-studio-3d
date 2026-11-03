import type { CommunityBridge, CommunityMethod } from "../../shared/community-bridge.ts";
import { isCommunityResponse } from "../../shared/community-bridge.ts";
import { isApiError } from "../engine-client/response-checks.ts";

// The community server did not answer (not running, wrong address, offline); views offer to connect one.
export class CommunityNotConnected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommunityNotConnected";
  }
}

// The action needs an account; views offer to sign in.
export class CommunitySignedOut extends Error {
  constructor(message = "Sign in to the community to do this") {
    super(message);
    this.name = "CommunitySignedOut";
  }
}

export class CommunityRejected extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CommunityRejected";
  }
}

export class CommunityResponseInvalid extends Error {
  constructor(path: string) {
    super(`The community server sent an answer the app cannot read for ${path}`);
    this.name = "CommunityResponseInvalid";
  }
}

const bridge = (): CommunityBridge => window.icarus.community;

// The only place that talks to the community service; the main process forwards it with the session's token.
export async function communityRequest<T>(
  method: CommunityMethod,
  path: string,
  check: (body: unknown) => body is T,
  body?: unknown,
  community: () => CommunityBridge = bridge,
): Promise<T> {
  const response: unknown = await community().request({ method, path, body });
  if (!isCommunityResponse(response) || response.kind === "picture") {
    throw new CommunityResponseInvalid(path);
  }
  if (response.kind === "unreachable") {
    throw new CommunityNotConnected(response.reason);
  }
  if (response.status === 401) {
    throw new CommunitySignedOut(isApiError(response.body) ? response.body.message : undefined);
  }
  if (response.status >= 400) {
    const reason = isApiError(response.body) ? response.body : { code: "error", message: `Error ${response.status}` };
    throw new CommunityRejected(reason.code, reason.message, response.status);
  }
  if (!check(response.body)) {
    throw new CommunityResponseInvalid(path);
  }
  return response.body;
}

// A picture the service keeps (thumbnail, photo) as a data URL, or null when there is none or it cannot be read.
export async function communityPicture(
  path: string,
  community: () => CommunityBridge = bridge,
): Promise<string | null> {
  if (!path.startsWith("/v1/")) {
    return null;
  }
  const response: unknown = await community().request({ method: "GET", path, picture: true });
  if (!isCommunityResponse(response)) {
    return null;
  }
  return response.kind === "picture" ? response.dataUrl : null;
}
