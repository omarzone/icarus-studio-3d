import { describe, expect, it, vi } from "vitest";
import { waitForHealth } from "./health.ts";

describe("waitForHealth", () => {
  it("resolves with the health payload on the first 200", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ status: "ok", version: "0.1.0", api_version: 1 }));
    await expect(
      waitForHealth("http://127.0.0.1:9", { timeoutMs: 2000, intervalMs: 1, fetchFn }),
    ).resolves.toMatchObject({ status: "ok" });
  });

  it("rejects a server that is not a compatible engine", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ status: "ok", version: 7, api_version: 2 }));
    await expect(
      waitForHealth("http://127.0.0.1:9", { timeoutMs: 2000, intervalMs: 1, fetchFn }),
    ).rejects.toMatchObject({ reason: "incompatible" });
  });

  it("does not hang on a server that never answers a request", async () => {
    const fetchFn = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    await expect(waitForHealth("http://127.0.0.1:9", { timeoutMs: 60, intervalMs: 5, fetchFn })).rejects.toMatchObject({
      reason: "timeout",
    });
  });

  it("stops waiting as soon as the attempt is aborted", async () => {
    const controller = new AbortController();
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new Error("ECONNREFUSED"));
    const waiting = waitForHealth("http://127.0.0.1:9", {
      timeoutMs: 60_000,
      intervalMs: 5,
      fetchFn,
      signal: controller.signal,
    });
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ reason: "exited" });
  });

  it("rejects with reason timeout when the engine never answers", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(waitForHealth("http://127.0.0.1:9", { timeoutMs: 20, intervalMs: 5, fetchFn })).rejects.toMatchObject({
      reason: "timeout",
    });
  });
});
