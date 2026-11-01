import { describe, expect, it, vi } from "vitest";
import type { EngineBridge, EngineStatus } from "../../shared/engine-bridge.ts";
import { createEngineUrl } from "./engine-url.ts";
import { EngineError, EngineRejected, EngineResponseInvalid, EngineUnavailable, request } from "./request.ts";
import { isProjectState } from "./response-checks.ts";

function bridge(initial: EngineStatus) {
  let listener: ((status: EngineStatus) => void) | undefined;
  const fake: EngineBridge = {
    status: () => Promise.resolve(initial),
    onStatus: (callback) => {
      listener = callback;
      return () => undefined;
    },
    restart: () => Promise.resolve(),
  };
  return { fake, emit: (status: EngineStatus) => listener?.(status) };
}

const ready = { kind: "ready", url: "http://127.0.0.1:9000", version: "0.1.0" } as const;
const state = {
  project: { id: "0123456789ab", name: "P", world: { objects: [] }, bodies: [], brain: {} },
  revision: { number: 1, summary: "Created", created_at: "2026-11-01T00:00:00Z" },
  report: { ok: true },
  can_undo: false,
  can_redo: false,
};

function client(response: Response | (() => Response)) {
  const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(typeof response === "function" ? response() : response));
  const url = createEngineUrl(bridge(ready).fake);
  return { fetchFn, call: () => request("/projects/x", {}, isProjectState, { url, fetchFn }) };
}

describe("request", () => {
  it("resolves a valid body", async () => {
    const { call, fetchFn } = client(Response.json(state));
    await expect(call()).resolves.toMatchObject({ project: { id: "0123456789ab" } });
    expect(fetchFn).toHaveBeenCalledWith("http://127.0.0.1:9000/projects/x", expect.anything());
  });

  it("turns a 422 into a rejection with its issues", async () => {
    const body = { code: "invalid", message: "No", issues: [{ path: "objects.car", message: "Bad" }] };
    const { call } = client(Response.json(body, { status: 422 }));
    const error = await call().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(EngineRejected);
    expect(error instanceof EngineRejected && error.issues[0]?.path).toBe("objects.car");
  });

  it("turns other errors into an engine error with its code", async () => {
    const { call } = client(() =>
      Response.json({ code: "not_found", message: "Gone", details: null }, { status: 404 }),
    );
    await expect(call()).rejects.toMatchObject({ code: "not_found", message: "Gone" });
    await expect(call()).rejects.toBeInstanceOf(EngineError);
  });

  it("refuses an HTML crash page", async () => {
    const { call } = client(new Response("<html>Internal Server Error</html>", { status: 500 }));
    await expect(call()).rejects.toBeInstanceOf(EngineResponseInvalid);
  });

  it("refuses a body without the fields the app reads", async () => {
    const { call } = client(Response.json({ project: {}, revision: { number: 1 } }));
    await expect(call()).rejects.toBeInstanceOf(EngineResponseInvalid);
  });
});

describe("engine url", () => {
  it("waits while the engine starts, then uses its address", async () => {
    const { fake, emit } = bridge({ kind: "starting" });
    const pending = createEngineUrl(fake).current();
    emit({ kind: "ready", url: "http://127.0.0.1:9002", version: "0.1.0" });
    await expect(pending).resolves.toBe("http://127.0.0.1:9002");
  });

  it("fails at once when the engine is down", async () => {
    const url = createEngineUrl(bridge({ kind: "down", reason: "crashed", lastLog: [] }).fake);
    await expect(url.current()).rejects.toBeInstanceOf(EngineUnavailable);
  });

  it("follows the engine to a new port", async () => {
    const { fake, emit } = bridge(ready);
    const url = createEngineUrl(fake);
    await expect(url.current()).resolves.toBe("http://127.0.0.1:9000");
    emit({ kind: "ready", url: "http://127.0.0.1:9001", version: "0.1.0" });
    await expect(url.current()).resolves.toBe("http://127.0.0.1:9001");
    emit({ kind: "down", reason: "crashed", lastLog: [] });
    await expect(url.current()).rejects.toBeInstanceOf(EngineUnavailable);
  });
});

describe("scene checks", () => {
  it("refuses a scene whose geoms miss what the viewport draws", async () => {
    const { isSceneDescription } = await import("./response-checks.ts");
    const geom = {
      name: "car",
      body: "car",
      shape: "box",
      size: [1, 1, 1],
      position: [0, 0, 0],
      quaternion: [1, 0, 0, 0],
      color: "#ffffff",
    };
    expect(isSceneDescription({ revision: 1, bodies: [], lights: [], geoms: [geom] })).toBe(true);
    expect(isSceneDescription({ revision: 1, bodies: [], lights: [], geoms: [{ ...geom, size: undefined }] })).toBe(
      false,
    );
  });

  it("refuses a scene whose zones miss where to draw them", async () => {
    const { isSceneDescription } = await import("./response-checks.ts");
    const zone = {
      name: "goal:goal_zone",
      object: "goal",
      kind: "goal_zone",
      shape: "sphere",
      size: [3, 3, 3],
      position: [12, 0, 0],
      quaternion: [1, 0, 0, 0],
    };
    const scene = { revision: 1, bodies: [], lights: [], geoms: [] };
    expect(isSceneDescription({ ...scene, zones: [zone] })).toBe(true);
    expect(isSceneDescription({ ...scene, zones: [{ ...zone, kind: "portal" }] })).toBe(false);
    expect(isSceneDescription({ ...scene, zones: [{ ...zone, position: [1, 2] }] })).toBe(false);
  });

  it("takes a scene with or without a sky, and refuses a sky without its colors", async () => {
    const { isSceneDescription } = await import("./response-checks.ts");
    const scene = { revision: 1, bodies: [], lights: [], geoms: [] };
    const sky = { top: "#5F8FC4", horizon: "#E4ECEF", ambient: 1, fog: 0.2 };
    expect(isSceneDescription({ ...scene, sky: null })).toBe(true);
    expect(isSceneDescription({ ...scene, sky })).toBe(true);
    expect(isSceneDescription({ ...scene, sky: { ...sky, top: undefined } })).toBe(false);
  });
});
