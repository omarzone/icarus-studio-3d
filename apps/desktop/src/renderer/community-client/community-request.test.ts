import { expect, it } from "vitest";
import type { CommunityBridge, CommunityResponse } from "../../shared/community-bridge.ts";
import { isCommunityRequest } from "../../shared/community-bridge.ts";
import { isCategory, isList } from "./community-checks.ts";
import {
  CommunityNotConnected,
  CommunityRejected,
  CommunityResponseInvalid,
  CommunitySignedOut,
  communityRequest,
} from "./community-request.ts";

function answering(response: CommunityResponse): () => CommunityBridge {
  const bridge: CommunityBridge = {
    connection: () => Promise.reject(new Error("unused")),
    saveConnection: () => Promise.reject(new Error("unused")),
    session: () => Promise.resolve({ signedIn: false }),
    signIn: () => Promise.reject(new Error("unused")),
    signOut: () => Promise.resolve(),
    request: () => Promise.resolve(response),
    onSession: () => () => undefined,
  };
  return () => bridge;
}

const categories = isList(isCategory);
const ask = (response: CommunityResponse) =>
  communityRequest("GET", "/v1/categories", categories, undefined, answering(response));

it("returns an answer only after it has the expected shape", async () => {
  await expect(ask({ kind: "json", status: 200, body: [{ id: "cars", name: "Cars" }] })).resolves.toEqual([
    { id: "cars", name: "Cars" },
  ]);
  await expect(ask({ kind: "json", status: 200, body: [{ id: 3 }] })).rejects.toBeInstanceOf(CommunityResponseInvalid);
});

it("tells a missing server, a missing sign-in and a refusal apart", async () => {
  await expect(ask({ kind: "unreachable", reason: "down" })).rejects.toBeInstanceOf(CommunityNotConnected);
  await expect(
    ask({ kind: "json", status: 401, body: { code: "not_signed_in", message: "Sign in" } }),
  ).rejects.toBeInstanceOf(CommunitySignedOut);
  const refused = ask({ kind: "json", status: 409, body: { code: "conflict", message: "@ana is already taken" } });
  await expect(refused).rejects.toBeInstanceOf(CommunityRejected);
  await expect(refused).rejects.toThrow("@ana is already taken");
});

it("only lets the renderer reach the versioned API of the configured server", () => {
  expect(isCommunityRequest({ method: "GET", path: "/v1/creations?sort=recent&q=car%20park" })).toBe(true);
  for (const path of ["https://evil.test/v1/me", "/v1/../admin", "/health", "//evil.test/v1", "/v1/me\nHost: x"]) {
    expect(isCommunityRequest({ method: "GET", path }), path).toBe(false);
  }
  expect(isCommunityRequest({ method: "TRACE", path: "/v1/me" })).toBe(false);
});
