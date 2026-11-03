import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { CommunityConfig } from "./community-config.ts";
import { CommunityService } from "./community-service.ts";
import { SessionVault } from "./session-vault.ts";

const SERVER = "http://127.0.0.1:8790";

type Call = { url: string; init: RequestInit | undefined };

function service(answer: (url: string, init: RequestInit | undefined) => Response | Promise<Response>) {
  const calls: Call[] = [];
  let config: CommunityConfig = { communityUrl: SERVER, supabaseUrl: "", supabaseAnonKey: "" };
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    return answer(url, init);
  };
  const vault = new SessionVault(join(mkdtempSync(join(tmpdir(), "community-")), "session.bin"), {
    available: () => false,
    encrypt: (text) => Buffer.from(text),
    decrypt: (data) => data.toString(),
  });
  const community = new CommunityService({
    readConfig: () => config,
    writeConfig: (next) => {
      config = next;
    },
    vault,
    openExternal: async () => undefined,
    waitForCallback: () => Promise.reject(new Error("not used")),
    fetchFn,
  });
  return { community, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const authorization = (call: Call | undefined) => new Headers(call?.init?.headers).get("authorization");

it("signs in through the server's development mode and sends its token with every request", async () => {
  const { community, calls } = service((url) =>
    url.endsWith("/v1/dev/token") ? json({ access_token: "dev-token", expires_in: 3600 }) : json({ handle: "dev" }),
  );

  expect(community.connection().authMode).toBe("dev");
  expect(await community.request({ method: "GET", path: "/v1/me" })).toEqual({
    kind: "json",
    status: 200,
    body: { handle: "dev" },
  });
  expect(authorization(calls[0])).toBeNull();

  expect(await community.signIn({ provider: "github" })).toEqual({ kind: "signed-in", email: "dev@icarus.localhost" });
  await community.request({ method: "GET", path: "/v1/me" });
  expect(authorization(calls.at(-1))).toBe("Bearer dev-token");
  expect(await community.session()).toEqual({ signedIn: true, email: "dev@icarus.localhost" });
});

it("reports a server that does not answer instead of failing", async () => {
  const { community } = service(() => Promise.reject(new TypeError("fetch failed")));

  expect(await community.request({ method: "GET", path: "/v1/categories" })).toEqual({
    kind: "unreachable",
    reason: `The community server at ${SERVER} did not answer`,
  });
  expect(await community.signIn({ provider: "email" })).toEqual({
    kind: "failed",
    reason: "The community server did not answer",
  });
});

it("returns pictures as data URLs and nothing else as a picture", async () => {
  const png = new Uint8Array([137, 80, 78, 71]);
  const { community } = service((url) =>
    url.includes("thumbnail")
      ? new Response(png, { headers: { "content-type": "image/png" } })
      : new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }),
  );

  expect(await community.request({ method: "GET", path: "/v1/creations/a/thumbnail", picture: true })).toEqual({
    kind: "picture",
    status: 200,
    dataUrl: `data:image/png;base64,${Buffer.from(png).toString("base64")}`,
  });
  expect(await community.request({ method: "GET", path: "/v1/profiles/a/photo", picture: true })).toMatchObject({
    dataUrl: null,
  });
});

it("forgets the session when the server or the Supabase project changes", async () => {
  const { community } = service(() => json({ access_token: "dev-token", expires_in: 3600 }));
  await community.signIn({ provider: "google" });

  const saved = await community.saveConnection({
    communityUrl: "https://community.example.org",
    supabaseUrl: "https://project.supabase.co",
    supabaseAnonKey: "anon",
  });

  expect(saved).toMatchObject({ communityUrl: "https://community.example.org", authMode: "supabase" });
  expect(await community.session()).toEqual({ signedIn: false });
});
